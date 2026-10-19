import { randomUUID } from 'node:crypto';
import { keyFor, statusNotifications, pushMessage, invalidToken } from './events.mjs';

const apps = ['traveler', 'partner', 'admin'];
const validUid = uid => typeof uid === 'string' && uid.length > 0 && uid.length <= 128 && !uid.includes('/');
const transient = message => Object.assign(new Error(message), { code: 'notification/retry' });

export function createHandlers({ db, account, send, adminUids = () => [],
  serverTimestamp, clock = Date.now }) {
  const active = async () => (await db.doc('notificationWorker/config').get()).get('mode') === 'functions';
  const inbox = (notification, id, createdAt) => ({
    ...notification, createdAt, read: false, readAt: null,
    pushState: 'pending', retryCount: 0, nextAttemptAt: new Date(clock()).toISOString(), deviceResults: {},
  });
  const administrators = async () => {
    const result = [];
    for (const uid of new Set(adminUids())) if (validUid(uid) && (await account(uid))?.customClaims?.admin === true) result.push(uid);
    return result;
  };

  async function source({ collection, id, eventId, before, after, created }) {
    if (!after?.exists || !await active()) return { skipped: 'inactive-or-deleted' };
    const value = after.data(), previous = before?.exists ? before.data() : null;
    if (value.isSample || value.isDemo) return { skipped: 'sample' };
    if (!created && value.status === previous?.status) return { skipped: 'unchanged-status' };
    const pending = collection === 'offers' ? 'Pending' : collection === 'routes' ? 'pending' : null;
    const normalize = created && pending && (value.status !== pending || (collection === 'offers' && value.verified !== false));
    // A normalization update generates its own update event. Only that event queues
    // messages, so correcting a status cannot generate two admin requests.
    const correctStatus = created && pending && value.status !== pending;
    const notifications = correctStatus ? [] : statusNotifications(collection, id, value, previous, await administrators());
    const recipients = [];
    for (const notification of notifications) if (await account(notification.uid)) recipients.push(notification);
    const marker = db.doc(`notificationEvents/${keyFor(eventId)}`);
    return db.runTransaction(async transaction => {
      const [mode, done, current] = await Promise.all([
        transaction.get(db.doc('notificationWorker/config')), transaction.get(marker), transaction.get(after.ref),
      ]);
      const deleting = await Promise.all(recipients.map(notification => transaction.get(db.doc(`accountDeletionRequests/${notification.uid}`))));
      if (mode.get('mode') !== 'functions' || done.exists || !current.exists) return { skipped: 'inactive-duplicate-or-deleted' };
      // Firestore events can arrive out of order. Never reset an approved record
      // because a delayed create event arrived, or announce a superseded status.
      if (!current.updateTime.isEqual(after.updateTime)) return { skipped: 'superseded-event' };
      if (normalize) transaction.update(after.ref, {
        status: pending, ...(collection === 'offers' ? { verified: false } : {}),
        notificationUpdatedAt: serverTimestamp(),
      });
      const createdAt = after.updateTime.toDate().toISOString();
      let inserted = 0;
      for (const [index, notification] of recipients.entries()) {
        if (deleting[index].exists) continue;
        const notificationId = keyFor(`${eventId}:${notification.uid}:${notification.app}`);
        transaction.create(db.doc(`users/${notification.uid}/notifications/${notificationId}`), inbox(notification, notificationId, createdAt));
        inserted++;
      }
      transaction.create(marker, { collection, sourceId: id, eventId, processedAt: serverTimestamp() });
      return { notifications: inserted, normalized: Boolean(normalize) };
    });
  }

  async function provision(user) {
    if (!validUid(user?.uid) || !await active()) return { skipped: 'inactive-or-invalid' };
    if (!await account(user.uid)) return { skipped: 'missing-or-disabled-account' };
    const profile = db.doc(`users/${user.uid}`), preferences = db.doc(`users/${user.uid}/settings/preferences`);
    const notifications = db.doc(`users/${user.uid}/settings/notifications`);
    return db.runTransaction(async transaction => {
      const [mode, existing, settings, push, deletion] = await Promise.all([
        transaction.get(db.doc('notificationWorker/config')), transaction.get(profile),
        transaction.get(preferences), transaction.get(notifications),
        transaction.get(db.doc(`accountDeletionRequests/${user.uid}`)),
      ]);
      if (mode.get('mode') !== 'functions' || deletion.exists) return { skipped: 'inactive-or-deleting' };
      if (!existing.exists) transaction.create(profile, {
        id: user.uid, uid: user.uid, role: 'traveler',
        name: user.displayName || '', fullName: user.displayName || '', email: user.email || '',
        phone: user.phoneNumber || '', country: '',
        createdAt: user.metadata?.creationTime ? new Date(user.metadata.creationTime).toISOString() : new Date(clock()).toISOString(),
      });
      if (!settings.exists) transaction.create(preferences, { currency: 'USD', interests: [], darkMode: false, notifications: false });
      if (!push.exists) transaction.create(notifications, { traveler: false, partner: false, admin: false });
      return { profileCreated: !existing.exists };
    });
  }

  async function request(id) {
    if (!await active()) return { skipped: 'inactive' };
    const ref = db.doc(`notificationRequests/${id}`), snapshot = await ref.get();
    if (!snapshot.exists || snapshot.get('state') !== 'pending') return { skipped: 'processed-or-deleted' };
    const r = snapshot.data();
    const allowed = validUid(r.createdBy) && (await account(r.createdBy))?.customClaims?.admin === true
      && validUid(r.uid) && apps.includes(r.app)
      && typeof r.title === 'string' && r.title.trim().length > 0 && r.title.length <= 100
      && typeof r.body === 'string' && r.body.trim().length > 0 && r.body.length <= 500 && Boolean(await account(r.uid));
    return db.runTransaction(async transaction => {
      const [mode, current, deletion] = await Promise.all([transaction.get(db.doc('notificationWorker/config')), transaction.get(ref), validUid(r.uid) ? transaction.get(db.doc(`accountDeletionRequests/${r.uid}`)) : Promise.resolve({ exists: false })]);
      if (mode.get('mode') !== 'functions' || current.get('state') !== 'pending') return { skipped: 'inactive-or-processed' };
      if (!current.updateTime.isEqual(snapshot.updateTime)) throw transient('Notification request changed.');
      transaction.update(ref, { state: allowed ? 'processed' : 'rejected', processedAt: new Date(clock()).toISOString() });
      if (allowed && !deletion.exists) {
        const notificationId = keyFor(`request:${ref.path}`);
        transaction.create(db.doc(`users/${r.uid}/notifications/${notificationId}`), inbox({
          uid: r.uid, app: r.app, title: r.title, body: r.body, category: 'general', sourceCollection: '', sourceId: '',
        }, notificationId, new Date(clock()).toISOString()));
      }
      return { allowed: Boolean(allowed) };
    });
  }

  async function deliver(uid, id) {
    if (!validUid(uid) || !await active()) return { skipped: 'inactive-or-invalid' };
    const ref = db.doc(`users/${uid}/notifications/${id}`), lease = randomUUID();
    const claimed = await db.runTransaction(async transaction => {
      const [mode, snapshot] = await Promise.all([transaction.get(db.doc('notificationWorker/config')), transaction.get(ref)]);
      if (mode.get('mode') !== 'functions' || !snapshot.exists || snapshot.get('pushState') !== 'pending') return null;
      const n = snapshot.data();
      if (n.deliveryLeaseUntil > clock()) throw transient('Another invocation is delivering this notification.');
      if ((n.retryCount || 0) >= 6) {
        transaction.update(ref, { pushState: 'failed', deliveryLease: null, deliveryLeaseUntil: 0 });
        return null;
      }
      transaction.update(ref, { deliveryLease: lease, deliveryLeaseUntil: clock() + 180000, retryCount: (n.retryCount || 0) + 1 });
      return n;
    });
    if (!claimed) return { skipped: 'processed-or-deleted' };
    const finish = async fields => db.runTransaction(async transaction => {
      const current = await transaction.get(ref);
      if (current.exists && current.get('deliveryLease') === lease) transaction.update(ref, { ...fields, deliveryLease: null, deliveryLeaseUntil: 0 });
    });
    try {
      const preference = await db.doc(`users/${uid}/settings/notifications`).get(), user = await account(uid);
      const deleting = await db.doc(`accountDeletionRequests/${uid}`).get();
      if (claimed.uid !== uid || !apps.includes(claimed.app) || preference.get(claimed.app) !== true
        || deleting.exists || !user || (claimed.app === 'admin' && user.customClaims?.admin !== true)) {
        await finish({ pushState: 'disabled' }); return { disabled: true };
      }
      const devices = await db.collection(`users/${uid}/devices`).get();
      const eligible = devices.docs.filter(device => device.get('enabled') === true && device.get('provider') === 'fcm'
        && device.get('app') === claimed.app && typeof device.get('token') === 'string');
      let retry = false;
      for (const device of eligible) {
        const token = device.get('token'), deliveryKey = keyFor(`${device.ref.path}:${token}`);
        if (['sent', 'invalid'].includes(claimed.deviceResults?.[deliveryKey]?.state)) continue;
        // Recheck the binding immediately before send to avoid targeting a token
        // removed/rotated during sign-out. The remaining FCM race is documented.
        const [currentDevice, currentPreference] = await Promise.all([
          device.ref.get(), db.doc(`users/${uid}/settings/notifications`).get(),
        ]);
        if (!currentDevice.exists || currentDevice.get('token') !== token || currentDevice.get('enabled') !== true
          || currentPreference.get(claimed.app) !== true || !await active()) continue;
        let result;
        try { await send(pushMessage(token, id, claimed)); result = { state: 'sent' }; }
        catch (error) {
          if (invalidToken(error.code)) {
            result = { state: 'invalid' };
            await db.runTransaction(async transaction => {
              const current = await transaction.get(device.ref);
              if (current.exists && current.get('token') === token) transaction.delete(device.ref);
            });
          } else { result = { state: 'retry', code: error.code || 'send-failed' }; retry = true; }
        }
        await db.runTransaction(async transaction => {
          const current = await transaction.get(ref);
          if (!current.exists || current.get('deliveryLease') !== lease) throw transient('Delivery lease was lost.');
          transaction.update(ref, { [`deviceResults.${deliveryKey}`]: result });
        });
      }
      const attempts = (claimed.retryCount || 0) + 1;
      await finish({ pushState: retry ? (attempts < 6 ? 'pending' : 'failed') : eligible.length ? 'complete' : 'no-devices' });
      if (retry && attempts < 6) throw transient('Some devices need another delivery attempt.');
      return { devices: eligible.length };
    } catch (error) {
      await finish({});
      throw error;
    }
  }
  return { source, provision, request, deliver };
}

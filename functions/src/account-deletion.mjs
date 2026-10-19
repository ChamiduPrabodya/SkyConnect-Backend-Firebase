import { randomUUID } from 'node:crypto';
import { keyFor } from './events.mjs';

const validUid = uid => typeof uid === 'string' && uid.length > 0 && uid.length <= 128 && !uid.includes('/') && !['.', '..'].includes(uid);
export function requireDeletionIdentity(auth, data, now = Date.now()) {
  if (!validUid(auth?.uid)) throw Object.assign(new Error('Sign in before requesting deletion.'), { code: 'unauthenticated' });
  const age = now / 1000 - Number(auth.token?.auth_time);
  if (!Number.isFinite(age) || age < -30 || age > 300) throw Object.assign(new Error('Sign in again before deleting your account.'), { code: 'failed-precondition' });
  if (data?.confirmation !== 'DELETE' || Object.keys(data).some(key => key !== 'confirmation')) {
    throw Object.assign(new Error('Confirm deletion of your own account by entering DELETE.'), { code: 'invalid-argument' });
  }
  return auth.uid;
}
const condition = (fieldPath, value, op = 'EQUAL') => ({ fieldFilter: { field: { fieldPath }, op, value: { stringValue: value } } });

// Shared by the Spark worker and Cloud Functions. All privileged actions derive
// the UID from the protected request document, never a client-supplied target.
export class AccountDeletionProcessor {
  constructor({ store, disable, deleteAuth, deleteMedia = async () => {}, clock = Date.now }) {
    Object.assign(this, { store, disable, deleteAuth, deleteMedia, clock });
  }
  async process(uid) {
    if (!validUid(uid)) throw new Error('Invalid account deletion UID.');
    const path = `accountDeletionRequests/${uid}`, initial = await this.store.get(path);
    if (!initial || initial.data.status === 'completed') return { skipped: true };
    if (initial.data.uid !== uid || !['pending', 'processing'].includes(initial.data.status)) throw new Error('Invalid deletion request.');
    if (initial.data.leaseUntil > this.clock()) return { skipped: true };
    const owner = randomUUID();
    let job = { ...initial.data, status: 'processing', leaseOwner: owner, leaseUntil: this.clock() + 180000 };
    try { await this.store.commit([this.store.put(path, job, { updateTime: initial.updateTime })]); }
    catch (error) { if ([409, 412].includes(error.status)) return { skipped: true }; throw error; }
    let lastRenewal = this.clock();
    const sourcePaths = new Set([`partners/${uid}`]);
    const renew = async (force = false) => {
      if (!force && this.clock() - lastRenewal < 30000) return;
      const current = await this.store.get(path);
      if (current?.data.leaseOwner !== owner) throw new Error('Deletion lease lost.');
      job = { ...current.data, leaseUntil: this.clock() + 180000 };
      await this.store.commit([this.store.put(path, job, { updateTime: current.updateTime })]); lastRenewal = this.clock();
    };
    const remove = async document => {
      await renew();
      try { await this.store.commit([this.store.remove(document.path, document.updateTime)]); }
      catch (error) { if (error.status !== 404) throw error; }
    };
    const tree = async documentPath => {
      await renew();
      for (const collection of await this.store.children(documentPath)) {
        for (const child of await this.store.collectionDocuments(`${documentPath}/${collection}`)) await tree(child.path);
      }
      const current = await this.store.get(documentPath);
      if (current) await remove(current);
    };
    const matching = async (collectionId, fieldPath, value, group = false) => {
      // Delete each page before querying the next; no cursor can skip a record.
      for (;;) {
        const rows = await this.store.query({ from: [{ collectionId, ...(group ? { allDescendants: true } : {}) }],
          where: condition(fieldPath, value), limit: 100 });
        if (!rows.length) break;
        for (const row of rows) {
          if (['partners', 'offers', 'routes', 'bookings'].includes(collectionId)) sourcePaths.add(row.path);
          if (!['notifications', 'notificationRequests', 'notificationEvents'].includes(collectionId)) {
            await matching('notifications', 'sourceId', row.path.split('/').at(-1), true);
            await matching('notificationEvents', 'sourceId', row.path.split('/').at(-1));
            const state = await this.store.get(`notificationSourceState/${keyFor(row.path)}`);
            if (state) await remove(state);
          }
          await tree(row.path);
        }
      }
    };
    try {
      // Request presence already blocks client writes through security rules.
      // Disable/revoke first; delete Auth only after data/media cleanup succeeds.
      await this.disable(uid);
      await this.deleteMedia(uid, renew);
      await renew(true);
      for (const field of ['userId', 'partnerId', 'airlineId']) await matching('bookings', field, uid);
      for (const [collection, field] of [['offers', 'partnerId'], ['routes', 'airlineId'], ['packages', 'partnerId'], ['flights', 'airlineId']]) {
        await matching(collection, field, uid);
      }
      await matching('notificationRequests', 'uid', uid);
      await matching('notificationRequests', 'createdBy', uid);
      await matching('notifications', 'uid', uid, true);
      await matching('notifications', 'sourceId', uid, true);
      await matching('notificationEvents', 'sourceId', uid);
      await tree(`partners/${uid}`);
      await tree(`users/${uid}`); // Includes likes, plans, devices, settings, consent history and inboxes.
      const state = await this.store.get(`notificationSourceState/${keyFor(`partners/${uid}`)}`);
      if (state) await remove(state);
      const workerState = await this.store.get('notificationWorker/state');
      if (workerState?.data.cursors) {
        let changed = false;
        for (const cursor of Object.values(workerState.data.cursors)) {
          if ([...sourcePaths].some(path => cursor.name?.endsWith(`/${path}`))) { cursor.name = ''; changed = true; }
        }
        if (changed) await this.store.commit([this.store.put(workerState.path, workerState.data, { updateTime: workerState.updateTime })]);
      }
      await this.deleteAuth(uid);
      await tree(`users/${uid}`); // Defensive final sweep after Auth deletion.
      const current = await this.store.get(path);
      if (current?.data.leaseOwner !== owner) throw new Error('Deletion lease lost.');
      // Minimal security tombstone blocks still-valid old ID tokens. No names,
      // email, consent, devices, bookings or credentials are retained here.
      await this.store.commit([this.store.put(path, { status: 'completed', completedAt: new Date(this.clock()).toISOString(),
        expiresAt: new Date(this.clock() + 86400000).toISOString() }, { updateTime: current.updateTime })]);
      return { completed: true };
    } catch (error) {
      const current = await this.store.get(path);
      if (current?.data.leaseOwner === owner) await this.store.commit([this.store.put(path, {
        ...current.data, status: 'pending', leaseUntil: 0, leaseOwner: null, error: 'cleanup-failed',
      }, { updateTime: current.updateTime })]);
      throw error;
    }
  }
  async cleanupReceipts() {
    const rows = await this.store.query({ from: [{ collectionId: 'accountDeletionRequests' }],
      where: condition('expiresAt', new Date(this.clock()).toISOString(), 'LESS_THAN_OR_EQUAL'), limit: 100 });
    for (const row of rows) if (row.data.status === 'completed') await this.store.commit([this.store.remove(row.path, row.updateTime)]);
    return rows.length;
  }
  async tick() {
    await this.cleanupReceipts();
    const rows = await this.store.query({ from: [{ collectionId: 'accountDeletionRequests' }], where: {
      fieldFilter: { field: { fieldPath: 'status' }, op: 'IN', value: { arrayValue: { values: ['pending', 'processing'].map(stringValue => ({ stringValue })) } } },
    }, limit: 3 });
    let completed = 0, failed = 0;
    for (const row of rows) {
      try { if ((await this.process(row.path.split('/').at(-1))).completed) completed++; }
      catch { failed++; } // Preserve the pending request and let other jobs/notifications continue.
    }
    return { completed, failed };
  }
}

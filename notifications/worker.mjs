import { randomUUID } from 'node:crypto';
import { sourceCollections, keyFor, statusNotifications, pushMessage, invalidToken, retryAt } from './events.mjs';
const field = fieldPath => ({ fieldPath });
const order = fieldPath => ({ field: field(fieldPath), direction: 'ASCENDING' });
const equal = (fieldPath, value) => ({ fieldFilter: { field: field(fieldPath), op: 'EQUAL', value: { stringValue: value } } });

export class NotificationWorker {
  constructor({ store, send, account, adminUids = [], clock = Date.now, log = console.log }) {
    Object.assign(this, { store, send, account, adminUids, clock, log });
    this.owner = randomUUID();
  }
  async lease() {
    const path = 'notificationWorker/lease', current = await this.store.get(path);
    if (current && current.data.owner !== this.owner && current.data.until > this.clock()) return null;
    try {
      const result = await this.store.commit([this.store.put(path, { owner: this.owner, until: this.clock() + 300000 }, current ? { updateTime: current.updateTime } : { exists: false })]);
      this.lastLeaseAt = this.clock();
      return result.commitTime;
    } catch (error) { if ([409, 412].includes(error.status)) return null; throw error; }
  }
  async keepLease() {
    if (this.lastLeaseAt != null && this.clock() - this.lastLeaseAt > 60000 && !await this.lease()) throw Object.assign(new Error('Worker lease was lost.'), { code: 'lease-lost' });
  }
  async initialize(readTime) {
    const cursors = {};
    let count = 0;
    for (const collection of sourceCollections) {
      let after;
      do {
        await this.keepLease();
        const query = { from: [{ collectionId: collection }], orderBy: [order('__name__')], limit: 100, ...(after ? { startAt: { values: [{ referenceValue: after }], before: false } } : {}) };
        const rows = await this.store.query(query, readTime);
        if (rows.length) await this.store.commit(rows.map(row => this.store.put(`notificationSourceState/${keyFor(row.path)}`, { status: row.data.status || '', sourceVersion: row.updateTime })));
        count += rows.length;
        after = rows.length === 100 ? rows.at(-1).name : null;
      } while (after);
      cursors[collection] = { timestamp: readTime, name: '' };
    }
    const state = { cursors, initializedAt: readTime };
    await this.store.commit([this.store.put('notificationWorker/state', state)]);
    this.log(JSON.stringify({ event: 'initialized', baselineRecords: count, historicalNotificationsSent: 0 }));
    return state;
  }
  inbox(notification, id, createdAt) {
    return this.store.put(`users/${notification.uid}/notifications/${id}`, { ...notification, createdAt, read: false, readAt: null, pushState: 'pending', retryCount: 0, nextAttemptAt: new Date(this.clock()).toISOString(), deviceResults: {} }, { exists: false });
  }
  async changes(state) {
    const admins = [];
    for (const uid of this.adminUids) if ((await this.account(uid))?.customClaims?.admin === true) admins.push(uid);
    let processed = 0;
    for (const collection of sourceCollections) {
      const cursor = state.cursors[collection];
      const query = { from: [{ collectionId: collection }], where: { fieldFilter: { field: field('notificationUpdatedAt'), op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: cursor.timestamp } } }, orderBy: [order('notificationUpdatedAt'), order('__name__')], limit: 25 };
      if (cursor.name) query.startAt = { values: [{ timestampValue: cursor.timestamp }, { referenceValue: cursor.name }], before: false };
      const rows = await this.store.query(query);
      for (const row of rows) {
        await this.keepLease();
        const statePath = `notificationSourceState/${keyFor(row.path)}`;
        const previous = await this.store.get(statePath);
        const notifications = statusNotifications(collection, row.path.split('/').at(-1), row.data, previous?.data, admins);
        const writes = [];
        for (const notification of notifications) {
          if (!(await this.account(notification.uid))) continue;
          const id = keyFor(`${row.name}:${row.updateTime}:${notification.uid}:${notification.app}`);
          writes.push(this.inbox(notification, id, row.data.notificationUpdatedAt));
        }
        const next = { timestamp: row.data.notificationUpdatedAt, name: row.name };
        const nextState = { ...state, cursors: { ...state.cursors, [collection]: next } };
        writes.push(this.store.put(statePath, { status: row.data.status || '', sourceVersion: row.updateTime }));
        writes.push(this.store.put('notificationWorker/state', nextState));
        await this.store.commit(writes);
        Object.assign(state, nextState);
        processed++;
      }
    }
    return processed;
  }
  async requests() {
    const rows = await this.store.query({ from: [{ collectionId: 'notificationRequests' }], where: equal('state', 'pending'), limit: 10 });
    for (const row of rows) {
      await this.keepLease();
      const r = row.data;
      const admin = await this.account(r.createdBy);
      const allowed = admin?.customClaims?.admin === true && typeof r.uid === 'string' && r.uid.length > 0 && r.uid.length <= 128 && !r.uid.includes('/') && ['traveler','partner','admin'].includes(r.app) && typeof r.title === 'string' && r.title.trim().length > 0 && r.title.length <= 100 && typeof r.body === 'string' && r.body.trim().length > 0 && r.body.length <= 500 && await this.account(r.uid);
      const writes = [this.store.put(row.path, { ...r, state: allowed ? 'processed' : 'rejected', processedAt: new Date(this.clock()).toISOString() }, { updateTime: row.updateTime })];
      if (allowed) writes.push(this.inbox({ uid: r.uid, app: r.app, title: r.title, body: r.body, category: 'general', sourceCollection: '', sourceId: '' }, keyFor(`request:${row.path}`), new Date(this.clock()).toISOString()));
      await this.store.commit(writes);
    }
    return rows.length;
  }
  async deliveries() {
    const rows = await this.store.query({ from: [{ collectionId: 'notifications', allDescendants: true }], where: { compositeFilter: { op: 'AND', filters: [equal('pushState', 'pending'), { fieldFilter: { field: field('nextAttemptAt'), op: 'LESS_THAN_OR_EQUAL', value: { stringValue: new Date(this.clock()).toISOString() } } }] } }, orderBy: [order('nextAttemptAt')], limit: 10 });
    for (const row of rows) {
      await this.keepLease();
      const n = row.data;
      const preferences = await this.store.get(`users/${n.uid}/settings/notifications`);
      if (preferences?.data[n.app] === false || !(await this.account(n.uid))) {
        await this.store.commit([this.store.put(row.path, { ...n, pushState: 'disabled' }, { updateTime: row.updateTime })]);
        continue;
      }
      const devices = (await this.store.devices(n.uid)).filter(d => d.data.enabled && d.data.app === n.app && typeof d.data.token === 'string');
      const results = { ...n.deviceResults };
      let retry = false;
      for (const device of devices) {
        // Include token hash so a rotated token is not confused with an older send.
        const deliveryKey = keyFor(`${device.path}:${device.data.token}`);
        if (results[deliveryKey]?.state === 'sent' || results[deliveryKey]?.state === 'invalid') continue;
        try {
          await this.send(pushMessage(device.data.token, row.path.split('/').at(-1), n));
          results[deliveryKey] = { state: 'sent' };
        } catch (error) {
          if (invalidToken(error.code)) {
            results[deliveryKey] = { state: 'invalid' };
            try { await this.store.commit([this.store.remove(device.path, device.updateTime)]); }
            catch (cleanupError) { if (![409,412,404].includes(cleanupError.status)) throw cleanupError; }
          } else { results[deliveryKey] = { state: 'retry', code: error.code || 'send-failed' }; retry = true; }
        }
      }
      const attempts = (n.retryCount || 0) + 1;
      const state = retry ? (attempts < 6 ? 'pending' : 'failed') : devices.length ? 'complete' : 'no-devices';
      // Update delivery fields only; never overwrite a user's concurrent read flag.
      const fields = { pushState: state, retryCount: attempts, nextAttemptAt: retryAt(attempts, this.clock()), deviceResults: results };
      const write = this.store.put(row.path, fields, { exists: true });
      write.updateMask = { fieldPaths: Object.keys(fields) };
      try { await this.store.commit([write]); }
      catch (error) { if (error.status !== 404) throw error; }
    }
    return rows.length;
  }
  async tick() {
    if ((await this.store.get('notificationWorker/config'))?.data.mode === 'functions') {
      return { skipped: 'cloud-functions-mode' };
    }
    const leaseTime = await this.lease();
    if (!leaseTime) return { skipped: 'another-worker-holds-lease' };
    const stored = await this.store.get('notificationWorker/state');
    const state = stored?.data || await this.initialize(leaseTime);
    const changes = await this.changes(state), requests = await this.requests(), deliveries = await this.deliveries();
    return { changes, requests, deliveries };
  }
  async release() {
    const current = await this.store.get('notificationWorker/lease');
    if (current?.data.owner === this.owner) await this.store.commit([this.store.put(current.path, { owner: this.owner, until: 0 }, { updateTime: current.updateTime })]);
  }
}

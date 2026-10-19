import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHandlers } from '../src/handlers.mjs';

const enabled = /^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '');
const integration = (name, fn) => test(name, { skip: !enabled }, fn);
let app, db, handlers, send, accounts, sent;
const now = Date.parse('2026-10-18T00:00:00Z');
before(() => {
  if (!enabled) return;
  app = initializeApp({ projectId: 'demo-skyconnect' }, 'functions-handler-tests');
  db = getFirestore(app);
});
beforeEach(async () => {
  if (!enabled) return;
  for (const collection of await db.listCollections()) await db.recursiveDelete(collection);
  accounts = new Map(['traveler', 'partner', 'airline', 'admin'].map(uid => [uid, { uid, customClaims: { admin: uid === 'admin' } }]));
  sent = [];
  send = async message => { sent.push(message); };
  handlers = createHandlers({ db, account: async uid => accounts.get(uid), send: message => send(message),
    adminUids: () => ['admin', 'partner'], serverTimestamp: () => FieldValue.serverTimestamp(), clock: () => now });
  await db.doc('notificationWorker/config').set({ mode: 'functions' });
});
after(async () => { if (app) await deleteApp(app); });

async function event(collection, id, value, eventId, previous) {
  const ref = db.doc(`${collection}/${id}`);
  let before;
  if (previous) { await ref.set(previous); before = await ref.get(); }
  await ref.set(value);
  return { collection, id, eventId, before, after: await ref.get(), created: !previous };
}
const inboxes = async uid => (await db.collection(`users/${uid}/notifications`).get()).docs;
async function pending(id = 'n', app = 'traveler') {
  await db.doc('users/traveler/settings/notifications').set({ [app]: true });
  await db.doc(`users/traveler/notifications/${id}`).set({ uid: 'traveler', app, title: 'Notice', body: 'Body',
    createdAt: new Date(now).toISOString(), read: false, readAt: null, pushState: 'pending', retryCount: 0, deviceResults: {} });
}
async function device(id, token = id) {
  await db.doc(`users/traveler/devices/${id}`).set({ app: 'traveler', provider: 'fcm', platform: 'web', token, enabled: true });
}

integration('inactive functions do not provision accounts or duplicate the Spark sender', async () => {
  await db.doc('notificationWorker/config').set({ mode: 'worker' });
  await handlers.provision({ uid: 'traveler', email: 'test@example.com' });
  await handlers.source(await event('offers', 'offer', { partnerId: 'partner', status: 'Pending', verified: false }, 'created'));
  assert.equal((await db.doc('users/traveler').get()).exists, false);
  assert.equal((await inboxes('admin')).length, 0);
});

integration('concurrent duplicate offer events create one admin inbox and no fake admin recipients', async () => {
  const input = await event('offers', 'offer', { partnerId: 'partner', status: 'Pending', verified: false }, 'created');
  await Promise.all([handlers.source(input), handlers.source(input)]);
  assert.equal((await inboxes('admin')).length, 1);
  assert.equal((await inboxes('partner')).length, 0);
  assert.equal((await db.collection('notificationEvents').get()).size, 1);
});

integration('route creation queues admin review using the lowercase route status', async () => {
  await handlers.source(await event('routes', 'route', { airlineId: 'airline', status: 'pending' }, 'route-created'));
  assert.equal((await inboxes('admin')).length, 1);
  assert.equal((await db.doc('routes/route').get()).get('status'), 'pending');
});

integration('new offers normalize to Pending and only the resulting update queues review', async () => {
  const input = await event('offers', 'offer', { partnerId: 'partner', status: 'Published', verified: true }, 'offer-created');
  const result = await handlers.source(input);
  assert.equal(result.normalized, true);
  const after = await input.after.ref.get();
  assert.equal(after.get('status'), 'Pending'); assert.equal(after.get('verified'), false);
  assert.equal((await inboxes('admin')).length, 0);
  await handlers.source({ ...input, eventId: 'normalized', created: false, before: input.after, after });
  assert.equal((await inboxes('admin')).length, 1);
});

integration('late create events never reset an already approved route', async () => {
  const input = await event('routes', 'route', { airlineId: 'airline', status: 'pending' }, 'late-create');
  await input.after.ref.update({ status: 'approved' });
  assert.equal((await handlers.source(input)).skipped, 'superseded-event');
  assert.equal((await input.after.ref.get()).get('status'), 'approved');
});

integration('an already Pending admin-created offer without verified still queues review exactly once', async () => {
  const input = await event('offers', 'offer', { partnerId: 'partner', status: 'Pending' }, 'created');
  await handlers.source(input);
  const after = await input.after.ref.get();
  await handlers.source({ ...input, eventId: 'verified-normalized', created: false, before: input.after, after });
  assert.equal(after.get('verified'), false);
  assert.equal((await inboxes('admin')).length, 1);
});

integration('Confirmed and Cancelled bookings notify both assigned accounts with retry deduplication', async () => {
  const base = { userId: 'traveler', partnerId: 'partner', status: 'Pending' };
  const confirmed = await event('bookings', 'booking', { ...base, status: 'Confirmed' }, 'confirmed', base);
  await handlers.source(confirmed); await handlers.source(confirmed);
  assert.equal((await inboxes('traveler')).length, 1); assert.equal((await inboxes('partner')).length, 1);
  const cancelled = await event('bookings', 'booking', { ...base, status: 'Cancelled' }, 'cancelled', { ...base, status: 'Confirmed' });
  await handlers.source(cancelled);
  assert.equal((await inboxes('traveler')).length, 2); assert.equal((await inboxes('partner')).length, 2);
  assert.ok((await inboxes('traveler')).some(doc => doc.get('body').includes('Cancelled')));
});

integration('airline bookings use airlineId; unchanged metadata and samples produce no notifications', async () => {
  const base = { userId: 'traveler', airlineId: 'airline', status: 'Pending' };
  await handlers.source(await event('bookings', 'flight', { ...base, status: 'Confirmed' }, 'confirmed', base));
  assert.equal((await inboxes('airline')).length, 1);
  await handlers.source(await event('bookings', 'flight', { ...base, note: 'metadata' }, 'metadata', base));
  await handlers.source(await event('offers', 'sample', { partnerId: 'partner', status: 'Published', isSample: true }, 'sample'));
  assert.equal((await inboxes('admin')).length, 0);
  assert.equal((await db.doc('offers/sample').get()).get('status'), 'Published');
});

integration('Auth provisioning creates defaults once and preserves profile, preferences and push consent on retry', async () => {
  const user = { uid: 'traveler', email: 'test@example.com', metadata: { creationTime: new Date(now).toISOString() } };
  await Promise.all([handlers.provision(user), handlers.provision(user)]);
  assert.equal((await db.doc('users/traveler').get()).get('role'), 'traveler');
  assert.equal((await db.doc('users/traveler/settings/notifications').get()).get('traveler'), false);
  await db.doc('users/traveler').update({ name: 'Actual name' });
  await db.doc('users/traveler/settings/preferences').update({ currency: 'LKR' });
  await db.doc('users/traveler/settings/notifications').update({ traveler: true });
  await handlers.provision(user);
  assert.equal((await db.doc('users/traveler').get()).get('name'), 'Actual name');
  assert.equal((await db.doc('users/traveler/settings/preferences').get()).get('currency'), 'LKR');
  assert.equal((await db.doc('users/traveler/settings/notifications').get()).get('traveler'), true);
});

integration('Auth provisioning preserves a profile created first by the traveler frontend', async () => {
  await db.doc('users/traveler').set({ uid: 'traveler', name: 'Entered name', phone: '123', role: 'traveler' });
  await handlers.provision({ uid: 'traveler', email: 'test@example.com' });
  assert.equal((await db.doc('users/traveler').get()).get('name'), 'Entered name');
  assert.equal((await db.doc('users/traveler').get()).get('phone'), '123');
});

integration('late Auth and notification events cannot recreate an account being deleted',async()=>{
  await db.doc('accountDeletionRequests/traveler').set({uid:'traveler',status:'pending'});
  await handlers.provision({uid:'traveler',email:'test@example.com'});
  assert.equal((await db.doc('users/traveler').get()).exists,false);
  await handlers.source(await event('bookings','booking',{userId:'traveler',partnerId:'partner',status:'Pending'},'booking-created'));
  assert.equal((await inboxes('traveler')).length,0);
  assert.equal((await inboxes('partner')).length,1);
  await db.doc('accountDeletionRequests/traveler').delete();accounts.delete('traveler');
  await handlers.provision({uid:'traveler',email:'test@example.com'});
  assert.equal((await db.doc('users/traveler').get()).exists,false);
});

integration('manual requests recheck admin claims, target account and processed state', async () => {
  const request = { uid: 'traveler', app: 'traveler', title: 'Notice', body: 'A message', createdBy: 'admin', state: 'pending' };
  await db.doc('notificationRequests/valid').set(request);
  await Promise.all([handlers.request('valid'), handlers.request('valid')]);
  assert.equal((await inboxes('traveler')).length, 1);
  accounts.get('admin').customClaims.admin = false;
  await db.doc('notificationRequests/revoked').set(request);
  await handlers.request('revoked');
  assert.equal((await db.doc('notificationRequests/revoked').get()).get('state'), 'rejected');
  assert.equal((await inboxes('traveler')).length, 1);
});

integration('disabled consent keeps inbox history but prevents pushes', async () => {
  await pending(); await device('device');
  await db.doc('users/traveler/settings/notifications').update({ traveler: false });
  await handlers.deliver('traveler', 'n');
  assert.equal(sent.length, 0);
  assert.equal((await db.doc('users/traveler/notifications/n').get()).get('pushState'), 'disabled');
});

integration('delivery retries only failed devices and preserves concurrent user read state', async () => {
  await pending(); await device('ok'); await device('retry');
  const attempts = [];
  send = async message => {
    attempts.push(message.token);
    await db.doc('users/traveler/notifications/n').update({ read: true, readAt: 'read' });
    if (message.token === 'retry' && attempts.filter(token => token === 'retry').length === 1) throw Object.assign(new Error('temporary'), { code: 'messaging/server-unavailable' });
  };
  await assert.rejects(handlers.deliver('traveler', 'n'), /another delivery attempt/);
  await handlers.deliver('traveler', 'n');
  assert.equal(attempts.filter(token => token === 'ok').length, 1);
  assert.equal(attempts.filter(token => token === 'retry').length, 2);
  const notification = await db.doc('users/traveler/notifications/n').get();
  assert.equal(notification.get('read'), true); assert.equal(notification.get('pushState'), 'complete');
});

integration('expired token cleanup cannot delete a newly rotated device token', async () => {
  await pending(); await device('rotating', 'expired');
  send = async () => {
    await db.doc('users/traveler/devices/rotating').update({ token: 'new-token' });
    throw Object.assign(new Error('expired'), { code: 'messaging/registration-token-not-registered' });
  };
  await handlers.deliver('traveler', 'n');
  assert.equal((await db.doc('users/traveler/devices/rotating').get()).get('token'), 'new-token');
});

integration('concurrent delivery events acquire one lease and never send the same device twice', async () => {
  await pending(); await device('device');
  const results = await Promise.allSettled([handlers.deliver('traveler', 'n'), handlers.deliver('traveler', 'n')]);
  assert.ok(results.some(result => result.status === 'fulfilled'));
  assert.equal(sent.length, 1);
});

integration('transient delivery failures stop after six attempts', async () => {
  await pending(); await device('device');
  send = async () => { throw Object.assign(new Error('temporary'), { code: 'messaging/server-unavailable' }); };
  for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(handlers.deliver('traveler', 'n'));
  await handlers.deliver('traveler', 'n'); await handlers.deliver('traveler', 'n');
  const notification = await db.doc('users/traveler/notifications/n').get();
  assert.equal(notification.get('pushState'), 'failed'); assert.equal(notification.get('retryCount'), 6);
});

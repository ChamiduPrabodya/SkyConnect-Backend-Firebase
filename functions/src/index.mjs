import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { defineString } from 'firebase-functions/params';
import { info } from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { createPrivacyRuntime } from './privacy-runtime.mjs';
import { requireDeletionIdentity } from './account-deletion.mjs';
import * as functionsV1 from 'firebase-functions/v1';
import { createHandlers } from './handlers.mjs';

if (!getApps().length) initializeApp();
const administrators = defineString('NOTIFICATION_ADMIN_UIDS', {
  description: 'Comma-separated Auth UIDs; admin:true is checked before sending review requests.',
  default: '',
});
const handlers = createHandlers({
  db: getFirestore(),
  serverTimestamp: () => FieldValue.serverTimestamp(),
  adminUids: () => administrators.value().split(',').map(value => value.trim()).filter(Boolean),
  account: async uid => {
    if (typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/')) return null;
    try {
      const account = await getAuth().getUser(uid);
      return account.disabled ? null : account;
    } catch (error) {
      if (['auth/user-not-found', 'auth/invalid-uid'].includes(error.code)) return null;
      throw error;
    }
  },
  // The emulator must never contact the real FCM service.
  send: message => process.env.FUNCTIONS_EMULATOR === 'true'
    ? Promise.resolve('emulator-no-push-sent') : getMessaging().send(message),
});
const options = document => ({
  document, region: 'asia-south1', retry: true,
  minInstances: 0, maxInstances: 3, concurrency: 10,
  memory: '256MiB', timeoutSeconds: 120,
});
const created = collection => async event => {
  const result = await handlers.source({ collection, id: event.params.id, eventId: event.id, after: event.data, created: true });
  info('source-created', { collection, ...result });
};
const updated = collection => async event => {
  const result = await handlers.source({ collection, id: event.params.id, eventId: event.id,
    before: event.data?.before, after: event.data?.after, created: false });
  info('source-updated', { collection, ...result });
};

export const onOfferCreated = onDocumentCreated(options('offers/{id}'), created('offers'));
export const onOfferUpdated = onDocumentUpdated(options('offers/{id}'), updated('offers'));
export const onRouteCreated = onDocumentCreated(options('routes/{id}'), created('routes'));
export const onRouteUpdated = onDocumentUpdated(options('routes/{id}'), updated('routes'));
export const onPartnerCreated = onDocumentCreated(options('partners/{id}'), created('partners'));
export const onPartnerUpdated = onDocumentUpdated(options('partners/{id}'), updated('partners'));
export const onBookingCreated = onDocumentCreated(options('bookings/{id}'), created('bookings'));
export const onBookingUpdated = onDocumentUpdated(options('bookings/{id}'), updated('bookings'));
export const onNotificationRequested = onDocumentCreated(options('notificationRequests/{id}'),
  event => handlers.request(event.params.id));
export const dispatchNotification = onDocumentCreated(options('users/{uid}/notifications/{id}'),
  event => handlers.deliver(event.params.uid, event.params.id));

// Stable Auth lifecycle trigger; this is not the Identity Platform blocking hook.
// The second-generation onUserCreated API is currently a preview.
export const onUserCreated = functionsV1.region('asia-south1')
  .runWith({ failurePolicy: true, minInstances: 0, maxInstances: 3, timeoutSeconds: 120 })
  .auth.user().onCreate(user => handlers.provision(user));

function privacy() {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulatorHost && !/^(127\.0\.0\.1|localhost):\d+$/.test(emulatorHost)) throw new Error('Use a localhost Firestore emulator.');
  const config = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
  return createPrivacyRuntime({ projectId: process.env.GCLOUD_PROJECT || config.projectId,
    auth: getAuth(), storageBucket: config.storageBucket || process.env.FIREBASE_STORAGE_BUCKET,
    endpoint: emulatorHost ? `http://${emulatorHost}/v1` : undefined,
    request: async (url, options = {}) => {
      const token = emulatorHost ? 'owner' : (await getApp().options.credential.getAccessToken()).access_token;
      const response = await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error('Privacy backend request failed.'), { status: response.status });
      return result;
    },
  });
}
export const requestAccountDeletion = onCall({ region: 'asia-south1', minInstances: 0, maxInstances: 3 }, async request => {
  let uid;
  try { uid = requireDeletionIdentity(request.auth, request.data); }
  catch (error) { throw new HttpsError(error.code, error.message); }
  const ref = getFirestore().doc(`accountDeletionRequests/${uid}`);
  await getFirestore().runTransaction(async transaction => {
    const current = await transaction.get(ref);
    if (!current.exists) transaction.create(ref, { uid, status: 'pending', requestedAt: FieldValue.serverTimestamp(), authTime: request.auth.token.auth_time });
  });
  return { accepted: true };
});
export const deleteAccountData = onDocumentCreated({ ...options('accountDeletionRequests/{uid}'), timeoutSeconds: 540, concurrency: 1 }, async event => {
  const runtime = privacy();
  if ((await runtime.store.get('notificationWorker/config'))?.data.mode !== 'functions') return;
  await runtime.processor.process(event.params.uid);
});
export const cleanupDeletionReceipts = onSchedule({ schedule: 'every 24 hours', region: 'asia-south1', minInstances: 0, maxInstances: 1 },
  () => privacy().processor.cleanupReceipts());

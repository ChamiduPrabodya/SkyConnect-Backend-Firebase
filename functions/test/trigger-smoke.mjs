import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  assert.match(process.env[name] || '', /^(127\.0\.0\.1|localhost):\d+$/, `${name} must select a local emulator`);
}
const app = initializeApp({ projectId: 'demo-skyconnect' }, 'trigger-smoke');
const db = getFirestore(app), auth = getAuth(app);
async function waitFor(label, check) {
  const end = Date.now() + 45000;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out: ${label}`);
}
try {
  await db.doc('notificationWorker/config').set({ mode: 'functions' });
  for (const uid of ['emulator-admin', 'emulator-traveler', 'emulator-partner']) {
    await auth.createUser({ uid, email: `${uid}@example.com` });
  }
  await auth.setCustomUserClaims('emulator-admin', { admin: true });
  await waitFor('Auth lifecycle provisioned traveler', async () => (await db.doc('users/emulator-traveler').get()).exists);
  assert.equal((await db.doc('users/emulator-traveler/settings/notifications').get()).get('traveler'), false);
  await db.doc('offers/smoke-offer').set({ partnerId: 'emulator-partner', status: 'Pending', title: 'Emulator offer' });
  await waitFor('offer review inbox', async () => (await db.collection('users/emulator-admin/notifications').get()).size > 0);
  await db.doc('bookings/smoke-booking').set({ userId: 'emulator-traveler', partnerId: 'emulator-partner', status: 'Pending' });
  await waitFor('initial booking inbox', async () => (await db.collection('users/emulator-traveler/notifications').get()).size === 1);
  await db.doc('bookings/smoke-booking').update({ status: 'Confirmed' });
  await waitFor('Confirmed booking inbox', async () => (await db.collection('users/emulator-traveler/notifications').get()).size === 2);
  await db.doc('bookings/smoke-booking').update({ status: 'Cancelled' });
  await waitFor('Cancelled booking inbox', async () => (await db.collection('users/emulator-traveler/notifications').get()).size === 3);
  assert.equal((await db.collection('users/emulator-partner/notifications').get()).size, 3);
  await waitFor('inbox delivery trigger handled disabled consent', async () =>
    (await db.collection('users/emulator-traveler/notifications').get()).docs.every(doc => doc.get('pushState') === 'disabled'));
  await auth.createUser({uid:'emulator-delete',email:'emulator-delete@example.com',password:'test-password-123'});
  await waitFor('Auth profile before deletion',async()=>(await db.doc('users/emulator-delete').get()).exists);
  await db.doc('users/emulator-delete/likes/private').set({itemId:'private'});
  await db.doc('users/emulator-delete/savedPlans/private').set({plan:{private:true}});
  await db.doc('users/emulator-delete/devices/private').set({token:'private'});
  const signedIn=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-key`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'emulator-delete@example.com',password:'test-password-123',returnSecureToken:true}),
  }).then(response=>response.json());
  assert.ok(signedIn.idToken);
  const deletion=await fetch('http://127.0.0.1:5001/demo-skyconnect/asia-south1/requestAccountDeletion',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${signedIn.idToken}`},body:JSON.stringify({data:{confirmation:'DELETE'}}),
  }).then(response=>response.json());
  assert.equal(deletion.result?.accepted,true,JSON.stringify(deletion));
  await waitFor('account deletion trigger completed',async()=>(await db.doc('accountDeletionRequests/emulator-delete').get()).get('status')==='completed');
  assert.equal((await db.doc('users/emulator-delete').get()).exists,false);
  assert.equal((await db.collection('users/emulator-delete/likes').get()).size,0);
  assert.equal((await db.collection('users/emulator-delete/savedPlans').get()).size,0);
  assert.equal((await db.collection('users/emulator-delete/devices').get()).size,0);
  await assert.rejects(auth.getUser('emulator-delete'),{code:'auth/user-not-found'});
  console.log(JSON.stringify({ smoke: 'passed', project: 'demo-skyconnect', authProvisioning: true,
    offerReview: true, bookingCreatedConfirmedCancelled: true, deliveryTrigger: true, accountAndAuthDeletion:true, realPushesSent: 0 }));
} finally { await deleteApp(app); }

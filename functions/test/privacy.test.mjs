import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { AccountDeletionProcessor, requireDeletionIdentity } from '../src/account-deletion.mjs';
import { createPrivacyRuntime } from '../src/privacy-runtime.mjs';
import { NotificationStore } from '../src/rest-store.mjs';
import { keyFor } from '../src/events.mjs';

test('deletion identity requires recent authentication, explicit confirmation and no target UID', () => {
  const now = Date.now(), auth = { uid: 'victim', token: { auth_time: Math.floor(now/1000) } };
  assert.equal(requireDeletionIdentity(auth, {confirmation:'DELETE'}, now), 'victim');
  assert.throws(() => requireDeletionIdentity(null, {confirmation:'DELETE'}, now), /Sign in/);
  assert.throws(() => requireDeletionIdentity({...auth,token:{auth_time:now/1000-301}}, {confirmation:'DELETE'}, now), /Sign in again/);
  assert.throws(() => requireDeletionIdentity(auth, {confirmation:'DELETE',uid:'other'}, now), /own account/);
  assert.throws(() => requireDeletionIdentity(auth, {confirmation:'yes'}, now), /DELETE/);
});

const enabled = /^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '');
const integration = (name, fn) => test(name, {skip:!enabled}, fn);
let app, db, store, processor, actions, time;
before(() => { if(enabled){app=initializeApp({projectId:'demo-skyconnect'},'privacy-tests');db=getFirestore(app);} });
beforeEach(async () => {
  if (!enabled) return;
  for (const collection of await db.listCollections()) await db.recursiveDelete(collection);
  time=Date.parse('2026-10-18T00:00:00Z'); actions=[];
  const request=async(url,options={})=>{
    const response=await fetch(url,{...options,headers:{...options.headers,Authorization:'Bearer owner'}});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(result.error?.message||'Emulator error'),{status:response.status});
    return result;
  };
  store=new NotificationStore('demo-skyconnect',request,`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1`);
  processor=new AccountDeletionProcessor({store,clock:()=>time,
    disable:async uid=>actions.push(`disable:${uid}`),deleteMedia:async uid=>actions.push(`media:${uid}`),
    deleteAuth:async uid=>{assert.equal((await db.doc(`users/${uid}`).get()).exists,false);actions.push(`auth:${uid}`);},
  });
});
after(async()=>{if(app)await deleteApp(app);});
async function queue(uid='victim'){await db.doc(`accountDeletionRequests/${uid}`).set({uid,status:'pending',requestedAt:new Date(time).toISOString(),authTime:time/1000});}
async function fixture(){
  const rows={
    'users/victim':{name:'Private name'},'users/victim/likes/a':{itemId:'a'},
    'users/victim/savedPlans/a':{private:true},'users/victim/devices/a':{token:'private'},
    'users/victim/settings/preferences':{interests:['private']},'users/victim/consents/a':{agreed:true},
    'users/victim/notifications/a':{uid:'victim'},'users/victim/orphan/missing/deep/a':{private:true},
    'partners/victim':{phone:'private'},'partners/victim/settings/a':{private:true},
    'offers/stay':{partnerId:'victim'},'routes/route':{airlineId:'victim'},'packages/package':{partnerId:'victim'},'flights/flight':{airlineId:'victim'},
    'bookings/traveler':{userId:'victim',partnerId:'other',traveler:{email:'private@example.com'}},
    'bookings/provider':{userId:'other',partnerId:'victim'},'bookings/airline':{airlineId:'victim'},
    'users/other':{name:'Keep'},'users/other/savedPlans/keep':{keep:true},'offers/keep':{partnerId:'other'},
    'bookings/keep':{userId:'other',partnerId:'third'},'users/other/notifications/linked':{uid:'other',sourceId:'stay'},
    'users/other/notifications/keep':{uid:'other',sourceId:'keep'},
    'notificationRequests/sent':{createdBy:'victim',uid:'other'},'notificationRequests/target':{createdBy:'other',uid:'victim'},
    'notificationEvents/victim':{sourceId:'victim'},'notificationEvents/stay':{sourceId:'stay'},
    [`notificationSourceState/${keyFor('offers/stay')}`]:{status:'Published'},
    'notificationWorker/state':{cursors:{partners:{name:'projects/demo-skyconnect/databases/(default)/documents/partners/victim',timestamp:'2026-10-18T00:00:00Z'}}},
  };
  const batch=db.batch(); for(const [path,value]of Object.entries(rows))batch.set(db.doc(path),value);await batch.commit();await queue();
}

integration('full deletion recursively removes private and orphaned data, bookings, listings and Auth last',async()=>{
  await fixture();
  const batch=db.batch();for(let n=0;n<115;n++)batch.set(db.doc(`users/victim/likes/like-${n}`),{itemId:String(n)});await batch.commit();
  assert.deepEqual(await processor.process('victim'),{completed:true});
  assert.deepEqual(actions,['disable:victim','media:victim','auth:victim']);
  for(const path of ['users/victim','users/victim/orphan/missing/deep/a','partners/victim','offers/stay','routes/route','packages/package','flights/flight','bookings/traveler','bookings/provider','bookings/airline','users/other/notifications/linked','notificationRequests/sent','notificationRequests/target','notificationEvents/victim','notificationEvents/stay'])assert.equal((await db.doc(path).get()).exists,false,path);
  assert.equal((await db.collection('users/victim/likes').get()).size,0);
  assert.equal((await db.doc('notificationWorker/state').get()).get('cursors.partners.name'),'');
  for(const path of ['users/other','users/other/savedPlans/keep','offers/keep','bookings/keep','users/other/notifications/keep'])assert.equal((await db.doc(path).get()).exists,true,path);
  const receipt=(await db.doc('accountDeletionRequests/victim').get()).data();
  assert.deepEqual(Object.keys(receipt).sort(),['completedAt','expiresAt','status']);
  assert.equal(receipt.status,'completed');
});

integration('deletion is idempotent and an unrequested UID can never be erased',async()=>{
  await fixture();await processor.process('victim');await processor.process('victim');
  assert.equal(actions.filter(value=>value==='auth:victim').length,1);
  assert.deepEqual(await processor.process('other'),{skipped:true});
  assert.equal((await db.doc('users/other').get()).exists,true);
});

integration('failed cleanup leaves Auth undeleted and a retryable request; retry completes safely',async()=>{
  await fixture();const media=processor.deleteMedia;processor.deleteMedia=async()=>{throw new Error('Unavailable');};
  await assert.rejects(processor.process('victim'),/Unavailable/);
  assert.equal(actions.some(value=>value.startsWith('auth:')),false);
  assert.equal((await db.doc('accountDeletionRequests/victim').get()).get('status'),'pending');
  processor.deleteMedia=media;assert.equal((await processor.process('victim')).completed,true);
});

integration('completed security receipts are retained for 24 hours and then removed',async()=>{
  await queue();await processor.process('victim');
  assert.equal(await processor.cleanupReceipts(),0);
  time+=86400001;assert.equal(await processor.cleanupReceipts(),1);
  assert.equal((await db.doc('accountDeletionRequests/victim').get()).exists,false);
});

integration('a held deletion lease prevents another processor from deleting the same account',async()=>{
  await queue();await db.doc('accountDeletionRequests/victim').update({status:'processing',leaseOwner:'another',leaseUntil:time+10000});
  assert.deepEqual(await processor.process('victim'),{skipped:true});assert.equal(actions.length,0);
});

test('Storage cleanup checks only account-owned prefixes and object generations; permission failures stay failures',async()=>{
  const calls=[];
  const runtime=createPrivacyRuntime({projectId:'demo-skyconnect',storageBucket:'test-bucket',auth:{},request:async(url,options={})=>{
    const parsed=new URL(url);calls.push({url:parsed,method:options.method});
    if(options.method==='DELETE')return{};
    if(calls.filter(value=>value.method!=='DELETE').length===1)return{items:[{name:'partners/victim/listings/private.jpg',generation:'12'}]};
    return{};
  }});
  await runtime.processor.deleteMedia('victim',async()=>{});
  assert.deepEqual(calls.filter(value=>value.method!=='DELETE').map(value=>value.url.searchParams.get('prefix')),['partners/victim/','partners/victim/','users/victim/']);
  const removal=calls.find(value=>value.method==='DELETE');assert.equal(removal.url.searchParams.get('generation'),'12');assert.equal(removal.url.searchParams.get('ifGenerationMatch'),'12');
  const blocked=createPrivacyRuntime({projectId:'demo-skyconnect',storageBucket:'test-bucket',auth:{},request:async()=>{throw Object.assign(new Error('Denied'),{status:403});}});
  await assert.rejects(blocked.processor.deleteMedia('victim',async()=>{}),/Denied/);
});

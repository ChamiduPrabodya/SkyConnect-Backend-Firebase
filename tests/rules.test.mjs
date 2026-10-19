import test, { before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, collection, collectionGroup, getDocs, query, where, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
let env;
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
before(async () => {
  if (!enabled) return;
  env = await initializeTestEnvironment({ projectId: 'demo-skyconnect', firestore: { rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => {
  if (!env) return;
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db,'partners','hotel-owner'), { id:'hotel-owner',uid:'hotel-owner',name:'Hotel',type:'Tourism',status:'Approved',verified:true });
    await setDoc(doc(db,'partners','airline-owner'), { id:'airline-owner',uid:'airline-owner',type:'Airline',status:'Approved',verified:true });
    await setDoc(doc(db,'offers','hotel'), { partnerId:'hotel-owner',title:'Hotel',type:'stay',status:'Published',verified:true });
    await setDoc(doc(db,'routes','flight'), { airlineId:'airline-owner',status:'approved' });
  });
});
const ruleTest = (name, fn) => test(name, { skip: !enabled }, fn);
ruleTest('public catalog reads work; private records and pending listings are protected', async () => {
  const guest = env.unauthenticatedContext().firestore(), admin = env.authenticatedContext('admin',{admin:true}).firestore();
  await assertSucceeds(getDocs(query(collection(guest,'offers'), where('status','==','Published'))));
  await assertFails(getDocs(collection(guest,'offers')));
  await assertSucceeds(setDoc(doc(admin,'offers','pending'),{status:'Pending',partnerId:'hotel-owner'}));
  await assertFails(getDoc(doc(guest,'offers','pending')));
});
ruleTest('preferences, saved plans, and likes sync only within the owning account', async () => {
  const alice = env.authenticatedContext('alice').firestore(), bob = env.authenticatedContext('bob').firestore();
  for (const [list,id,value] of [['settings','preferences',{currency:'USD'}],['savedPlans','trip',{id:'trip',plan:{route:['ella']}}],['likes','destination-ella',{itemId:'ella',type:'destination',name:'Ella',createdAt:'2026-10-17'}]]) {
    await assertSucceeds(setDoc(doc(alice,'users','alice',list,id),value));
    await assertSucceeds(getDoc(doc(alice,'users','alice',list,id)));
    await assertFails(getDoc(doc(bob,'users','alice',list,id)));
    await assertFails(setDoc(doc(bob,'users','alice',list,id),value));
  }
});

ruleTest('a traveler can complete an Auth-created baseline without changing its identity or role', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'users', 'alice'), {
    uid: 'alice', id: 'alice', role: 'traveler', name: '', fullName: '', email: 'alice@example.com',
    phone: '', country: '', createdAt: '2026-10-18',
  }));
  const alice = env.authenticatedContext('alice').firestore();
  await assertSucceeds(updateDoc(doc(alice, 'users', 'alice'), { name: 'Alice', fullName: 'Alice', phone: '123', country: 'LK', updatedAt: '2026-10-18' }));
  await assertFails(updateDoc(doc(alice, 'users', 'alice'), { role: 'admin' }));
  await assertFails(updateDoc(doc(alice, 'users', 'alice'), { uid: 'other' }));
});
ruleTest('partners cannot self-approve or overwrite other providers listings', async () => {
  const owner = env.authenticatedContext('hotel-owner').firestore();
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(),'partners','hotel-owner'),{status:'Pending',verified:false}));
  await assertFails(updateDoc(doc(owner,'partners','hotel-owner'),{status:'Approved'}));
  await assertFails(updateDoc(doc(owner,'offers','hotel'),{status:'Published',title:'Changed'}));
  await assertSucceeds(updateDoc(doc(owner,'offers','hotel'),{status:'Pending',verified:false,title:'Changed'}));
  const other = env.authenticatedContext('other').firestore();
  await assertFails(updateDoc(doc(other,'offers','hotel'),{title:'Stolen',status:'Pending',verified:false}));
});
ruleTest('booking links are checked and only assigned providers can confirm', async () => {
  const traveler = env.authenticatedContext('traveler').firestore(), provider = env.authenticatedContext('hotel-owner').firestore(), other = env.authenticatedContext('other').firestore();
  const booking = {userId:'traveler',kind:'stay',offerId:'hotel',partnerId:'hotel-owner',status:'Pending'};
  await assertSucceeds(setDoc(doc(traveler,'bookings','request'),booking));
  await assertFails(setDoc(doc(traveler,'bookings','forged'),{...booking,partnerId:'other'}));
  await assertFails(updateDoc(doc(traveler,'bookings','request'),{status:'Confirmed'}));
  await assertFails(updateDoc(doc(other,'bookings','request'),{status:'Confirmed'}));
  await assertSucceeds(getDocs(query(collection(provider,'bookings'),where('partnerId','==','hotel-owner'))));
  await assertSucceeds(updateDoc(doc(provider,'bookings','request'),{status:'Confirmed'}));
  await assertSucceeds(updateDoc(doc(traveler,'bookings','request'),{status:'Cancelled'}));
  await assertFails(updateDoc(doc(provider,'bookings','request'),{status:'Confirmed'}));
});
ruleTest('airline route changes require approval and retain ownership', async () => {
  const airline = env.authenticatedContext('airline-owner').firestore();
  await assertFails(updateDoc(doc(airline,'routes','flight'),{airlineId:'other',status:'pending'}));
  await assertSucceeds(updateDoc(doc(airline,'routes','flight'),{flightNo:'SC123',status:'pending'}));
  await assertFails(updateDoc(doc(airline,'routes','flight'),{status:'approved'}));
});
ruleTest('admins see all trips; airline and cabana owners can read only their assigned requests after submission', async () => {
  const traveler = env.authenticatedContext('traveler').firestore();
  const airline = env.authenticatedContext('airline-owner').firestore();
  const cabana = env.authenticatedContext('hotel-owner').firestore();
  const other = env.authenticatedContext('other').firestore();
  const admin = env.authenticatedContext('admin', {admin:true}).firestore();
  const guest = env.unauthenticatedContext().firestore();
  await assertSucceeds(setDoc(doc(traveler,'users','traveler','savedPlans','trip'), {savedAt:'2026-10-19',plan:{flightId:'flight',hotelId:'hotel'}}));
  for (const provider of [airline,cabana,other,guest]) await assertFails(getDoc(doc(provider,'users','traveler','savedPlans','trip')));
  await assertSucceeds(getDocs(collectionGroup(admin,'savedPlans')));
  await assertSucceeds(setDoc(doc(traveler,'bookings','air'), {userId:'traveler',kind:'flight',routeId:'flight',airlineId:'airline-owner',status:'Pending',traveler:{name:'Alice',phone:'123'}}));
  await assertSucceeds(setDoc(doc(traveler,'bookings','cabana'), {userId:'traveler',kind:'stay',offerId:'hotel',partnerId:'hotel-owner',status:'Pending',traveler:{name:'Alice',phone:'123'}}));
  await assertSucceeds(getDoc(doc(airline,'bookings','air')));
  await assertSucceeds(getDoc(doc(cabana,'bookings','cabana')));
  await assertFails(getDoc(doc(airline,'bookings','cabana')));
  await assertFails(getDoc(doc(cabana,'bookings','air')));
  for (const db of [other,guest]) for (const id of ['air','cabana']) await assertFails(getDoc(doc(db,'bookings',id)));
  for (const db of [airline,cabana,other,guest]) await assertFails(getDocs(collection(db,'bookings')));
  await assertSucceeds(getDocs(query(collection(airline,'bookings'),where('airlineId','==','airline-owner'))));
  await assertSucceeds(getDocs(query(collection(cabana,'bookings'),where('partnerId','==','hotel-owner'))));
  await assertSucceeds(getDocs(collection(admin,'bookings')));
  await assertFails(updateDoc(doc(airline,'bookings','air'),{airlineId:'other'}));
  await assertFails(updateDoc(doc(cabana,'bookings','cabana'),{partnerId:'other'}));
});
ruleTest('push tokens are private and clients cannot create notifications or change delivery state', async () => {
  const alice=env.authenticatedContext('alice').firestore(), bob=env.authenticatedContext('bob').firestore();
  const device={app:'traveler',provider:'fcm',platform:'web',token:'private-device-token-123456789',enabled:true,updatedAt:serverTimestamp()};
  await assertSucceeds(setDoc(doc(alice,'users','alice','devices','browser'),device));
  await assertFails(getDoc(doc(bob,'users','alice','devices','browser')));
  await assertFails(setDoc(doc(bob,'users','alice','devices','other'),device));
  await assertFails(setDoc(doc(alice,'users','alice','notifications','fake'),{title:'Forged',read:false}));
  await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'users','alice','notifications','real'),{title:'Real',read:false,readAt:null,pushState:'pending'}));
  await assertSucceeds(updateDoc(doc(alice,'users','alice','notifications','real'),{read:true,readAt:'2026-10-18'}));
  await assertFails(updateDoc(doc(alice,'users','alice','notifications','real'),{pushState:'complete'}));
  await assertFails(getDoc(doc(bob,'users','alice','notifications','real')));
});
ruleTest('only admins can queue messages; notification cursors and watch timestamps cannot be forged', async () => {
  const alice=env.authenticatedContext('alice').firestore(), admin=env.authenticatedContext('admin',{admin:true}).firestore();
  const request={uid:'alice',app:'traveler',title:'Notice',body:'Message',createdBy:'alice',createdAt:serverTimestamp(),state:'pending'};
  await assertFails(setDoc(doc(alice,'notificationRequests','forged'),request));
  await assertSucceeds(setDoc(doc(admin,'notificationRequests','valid'),{...request,createdBy:'admin'}));
  await assertFails(setDoc(doc(admin,'notificationRequests','wrong-sender'),request));
  await assertFails(setDoc(doc(alice,'notificationWorker','state'),{cursor:'fake'}));
  await assertFails(setDoc(doc(admin,'notificationWorker','config'),{mode:'functions'}));
  await assertFails(setDoc(doc(admin,'notificationEvents','event'),{processed:true}));
  const provider=env.authenticatedContext('hotel-owner').firestore();
  await assertSucceeds(updateDoc(doc(provider,'partners','hotel-owner'),{phone:'123',notificationUpdatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(provider,'partners','hotel-owner'),{phone:'456',notificationUpdatedAt:Timestamp.fromMillis(0)}));
});

ruleTest('registration consent is explicit, server-timed, private and immutable in its audit receipt', async () => {
  const alice=env.authenticatedContext('alice').firestore(), bob=env.authenticatedContext('bob').firestore();
  const profile={uid:'alice',id:'alice',role:'traveler',name:'Alice'};
  await assertFails(setDoc(doc(alice,'users','alice'),profile));
  const consent={agreed:true,timestamp:serverTimestamp(),version:'1.0',scopes:['travel_preferences','location_matching']};
  const batch=writeBatch(alice);
  batch.set(doc(alice,'users','alice','consents','registration'),consent);
  batch.set(doc(alice,'users','alice'),{...profile,pdpaConsent:consent,pdpaConsentRecordId:'registration'});
  await assertSucceeds(batch.commit());
  await assertFails(updateDoc(doc(alice,'users','alice','consents','registration'),{agreed:false}));
  await assertFails(getDoc(doc(bob,'users','alice','consents','registration')));
  await assertFails(setDoc(doc(alice,'users','alice','consents','forged'),{...consent,timestamp:Timestamp.fromMillis(0)}));
  await assertFails(updateDoc(doc(alice,'users','alice'),{pdpaConsent:{...consent,version:'unknown'},pdpaConsentRecordId:'registration'}));
});
ruleTest('a partner can atomically register with its own privacy receipt but cannot forge another UID consent',async()=>{
  const owner=env.authenticatedContext('new-partner').firestore();
  const consent={agreed:true,timestamp:serverTimestamp(),version:'1.0',scopes:['partner_profile','location_matching']};
  const profile={uid:'new-partner',id:'new-partner',type:'Airline',status:'Pending',verified:false,pdpaConsent:consent,pdpaConsentRecordId:'registration'};
  const batch=writeBatch(owner);batch.set(doc(owner,'users','new-partner','consents','registration'),consent);batch.set(doc(owner,'partners','new-partner'),profile);
  await assertSucceeds(batch.commit());
  await assertFails(setDoc(doc(owner,'users','someone-else','consents','registration'),consent));
});
ruleTest('deletion queue requires the owning UID and a recent auth_time; clients cannot complete requests',async()=>{
  const recent=Math.floor(Date.now()/1000);
  const alice=env.authenticatedContext('alice',{auth_time:recent}).firestore(),bob=env.authenticatedContext('bob',{auth_time:recent}).firestore();
  const stale=env.authenticatedContext('stale',{auth_time:recent-301}).firestore();
  const request=uid=>({uid,status:'pending',requestedAt:serverTimestamp(),authTime:recent});
  await assertFails(setDoc(doc(bob,'accountDeletionRequests','alice'),request('alice')));
  await assertFails(setDoc(doc(stale,'accountDeletionRequests','stale'),{...request('stale'),authTime:recent-301}));
  await assertFails(setDoc(doc(alice,'accountDeletionRequests','alice'),{...request('alice'),requestedAt:'client-time'}));
  await assertSucceeds(setDoc(doc(alice,'accountDeletionRequests','alice'),request('alice')));
  await assertFails(updateDoc(doc(alice,'accountDeletionRequests','alice'),{status:'completed'}));
  await assertFails(getDoc(doc(bob,'accountDeletionRequests','alice')));
  await assertSucceeds(getDoc(doc(alice,'accountDeletionRequests','alice')));
});
ruleTest('pending deletion blocks stale tokens from recreating data and creating new provider requests',async()=>{
  const alice=env.authenticatedContext('alice').firestore();
  await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'accountDeletionRequests','alice'),{uid:'alice',status:'pending'}));
  await assertFails(setDoc(doc(alice,'users','alice','settings','preferences'),{currency:'LKR'}));
  await assertFails(setDoc(doc(alice,'users','alice','likes','a'),{itemId:'a'}));
  await assertFails(setDoc(doc(alice,'bookings','new'),{userId:'alice',kind:'stay',offerId:'hotel',partnerId:'hotel-owner',status:'Pending'}));
});

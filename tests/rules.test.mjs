import test, { before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, collection, getDocs, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
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
  const provider=env.authenticatedContext('hotel-owner').firestore();
  await assertSucceeds(updateDoc(doc(provider,'partners','hotel-owner'),{phone:'123',notificationUpdatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(provider,'partners','hotel-owner'),{phone:'456',notificationUpdatedAt:Timestamp.fromMillis(0)}));
});

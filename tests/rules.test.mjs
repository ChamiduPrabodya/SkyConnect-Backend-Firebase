import test, { before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, collection, collectionGroup, getDocs, query, where, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
const validOffer={title:'Hotel',type:'stay',priceUSD:80,totalRooms:5,maxGuests:2,phone:'+94712345678',email:'hotel@example.com',city:'Galle',coordinates:{latitude:6.9,longitude:80.2}};
const validRoute={flightNo:'UL-424',origin:{code:'LHR'},destination:{code:'CMB'},aircraft:'A320',startDate:'2026-12-01',departureTime:'08:00',arrivalTime:'20:00',price:{economy:80},seats:{economy:5}};
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
    await setDoc(doc(db,'offers','hotel'), {...validOffer,partnerId:'hotel-owner',title:'Hotel',type:'stay',status:'Published',verified:true,isSample:false,catalogEligible:true});
    await setDoc(doc(db,'routes','flight'), {...validRoute,airlineId:'airline-owner',status:'approved',isSample:false,catalogEligible:true});
  });
});
const stayQuote={quoteVersion:2,roomIndex:-1,roomId:'',rooms:1,nights:1,quantity:1,guests:2,requestedPriceUSD:80,requestedPriceLKR:24000,totalPrice:24000,totalAmount:24000};
const ruleTest = (name, fn) => test(name, { skip: !enabled }, fn);
ruleTest('anonymous Skylo identity reads public listings but cannot save plans, profiles or booking requests',async()=>{
 const db=env.authenticatedContext('guest',{firebase:{sign_in_provider:'anonymous'}}).firestore();
 await assertSucceeds(getDoc(doc(db,'offers','hotel')));
 await assertSucceeds(getDoc(doc(db,'routes','flight')));
 await assertFails(setDoc(doc(db,'users','guest','savedPlans','trip'),{route:['galle']}));
 await assertFails(setDoc(doc(db,'users','guest'),{uid:'guest',role:'traveler'}));
 await assertFails(setDoc(doc(db,'bookings','guest-request'),{...stayQuote,userId:'guest',kind:'stay',offerId:'hotel',partnerId:'hotel-owner',status:'Pending'}));
});
const scheduledRoute={...validRoute,scheduleVersion:2,origin:{code:'LHR',timeZone:'Europe/London'},destination:{code:'CMB',timeZone:'Asia/Colombo'},endDate:'2027-12-31',operatingDays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],arrivalDayOffset:0,mandatoryFeesIncluded:true,priceCurrency:'USD',fareBasis:'one_way',passengerFares:{economy:{childPolicy:'custom',childUSD:50,infantUSD:10}}};
ruleTest('partner submission to admin publication to traveler request to owner confirmation keeps prices and ownership',async()=>{
 const airline=env.authenticatedContext('airline-owner').firestore(),admin=env.authenticatedContext('admin',{admin:true}).firestore(),traveler=env.authenticatedContext('traveler').firestore(),stranger=env.authenticatedContext('other').firestore();
 const ref=doc(airline,'routes','workflow');
 await assertSucceeds(setDoc(ref,{...scheduledRoute,airlineId:'airline-owner',status:'pending',isSample:false,catalogEligible:false}));
 await assertFails(getDoc(doc(traveler,'routes','workflow')));
 await assertFails(updateDoc(ref,{status:'approved',catalogEligible:true}));
 await assertSucceeds(updateDoc(doc(admin,'routes','workflow'),{status:'approved',catalogEligible:true}));
 assert.equal((await getDoc(doc(traveler,'routes','workflow'))).data().flightNo,'UL-424');
 const request={userId:'traveler',kind:'flight',routeId:'workflow',airlineId:'airline-owner',status:'Pending',cabin:'Economy',adults:1,children:0,infants:0,quoteVersion:2,requestedPriceUSD:80,requestedPriceLKR:24000,totalPrice:24000,totalAmount:24000,dateMode:'fixed',departureDate:'2027-02-01',flightLeg:'outbound'};
 await assertSucceeds(setDoc(doc(traveler,'bookings','workflow'),request));
 await assertFails(updateDoc(doc(stranger,'bookings','workflow'),{status:'Confirmed'}));
 await assertFails(updateDoc(doc(airline,'bookings','workflow'),{status:'Confirmed',totalPrice:1}));
 await assertSucceeds(updateDoc(doc(airline,'bookings','workflow'),{status:'Confirmed'}));
 assert.equal((await getDoc(doc(traveler,'bookings','workflow'))).data().status,'Confirmed');
 await assertSucceeds(updateDoc(doc(airline,'bookings','workflow'),{status:'Completed'}));
 await assertFails(updateDoc(doc(airline,'bookings','workflow'),{status:'Confirmed'}));
 await assertFails(updateDoc(doc(traveler,'bookings','workflow'),{status:'Cancelled'}));
});
ruleTest('revoked provider cannot confirm an existing request but can cancel it',async()=>{
 const traveler=env.authenticatedContext('traveler').firestore(),provider=env.authenticatedContext('hotel-owner').firestore();
 await assertSucceeds(setDoc(doc(traveler,'bookings','revoked-existing'),{...stayQuote,userId:'traveler',kind:'stay',offerId:'hotel',partnerId:'hotel-owner',status:'Pending'}));
 await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'partners','hotel-owner'),{status:'Rejected'}));
 await assertFails(updateDoc(doc(provider,'bookings','revoked-existing'),{status:'Confirmed'}));
 await assertSucceeds(updateDoc(doc(provider,'bookings','revoked-existing'),{status:'Cancelled'}));
});
ruleTest('scheduled flight rules protect canonical passenger fares against stale prices and legacy downgrade',async()=>{
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'routes','modern'),{...scheduledRoute,airlineId:'airline-owner',status:'approved',isSample:false,catalogEligible:true}));
 const db=env.authenticatedContext('traveler').firestore();
 const booking={userId:'traveler',kind:'flight',routeId:'modern',airlineId:'airline-owner',status:'Pending',cabin:'Economy',adults:2,children:1,infants:1,quoteVersion:2,requestedPriceUSD:220,requestedPriceLKR:66000,totalPrice:66000,totalAmount:66000,dateMode:'fixed',departureDate:'2027-02-01',flightLeg:'outbound'};
 await assertSucceeds(setDoc(doc(db,'bookings','priced'),booking));
 for(const patch of [{quoteVersion:1},{requestedPriceUSD:1},{requestedPriceLKR:1,totalPrice:1,totalAmount:1},{adults:0},{children:6},{cabin:'Invented'},{departureDate:'2028-01-01'},{flightLeg:'round_trip'}])await assertFails(setDoc(doc(db,'bookings','bad-price'),{...booking,...patch}));
 await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'routes','modern'),{price:{economy:90}}));
 await assertFails(setDoc(doc(db,'bookings','stale'),booking));
});
ruleTest('round-trip submission requires the complete opposite schedule and one combined quoted fare',async()=>{
 const owner=env.authenticatedContext('airline-owner').firestore();
 const route={...scheduledRoute,airlineId:'airline-owner',status:'pending',isSample:false,catalogEligible:false,fareBasis:'return'};
 await assertFails(setDoc(doc(owner,'routes','round'),route));
 const returnLeg={...scheduledRoute,flightNo:'UL-425',origin:scheduledRoute.destination,destination:scheduledRoute.origin};
 await assertSucceeds(setDoc(doc(owner,'routes','round'),{...route,returnLeg}));
 await assertFails(updateDoc(doc(owner,'routes','round'),{returnLeg:{...returnLeg,origin:{code:'HRI',timeZone:'Asia/Colombo'}}}));
 await assertFails(updateDoc(doc(owner,'routes','round'),{mandatoryFeesIncluded:false}));
 await assertFails(updateDoc(doc(owner,'routes','round'),{operatingDays:['Everyday']}));
});
ruleTest('structured room quotes enforce real room, capacity, nights and published dated conversion',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{
  await updateDoc(doc(ctx.firestore(),'offers','hotel'),{serviceDetails:{rooms:[{id:'family',priceUSD:100,capacity:4}]}});
  await setDoc(doc(ctx.firestore(),'referenceData','exchangeRates'),{base:'USD',quote:'LKR',rate:310,asOf:'2026-11-17',source:'Test rate'});
 });
 const db=env.authenticatedContext('traveler').firestore(),booking={userId:'traveler',kind:'stay',offerId:'hotel',partnerId:'hotel-owner',status:'Pending',quoteVersion:2,roomIndex:0,roomId:'family',rooms:1,nights:3,quantity:3,guests:4,requestedPriceUSD:300,requestedPriceLKR:93000,totalAmount:93000,totalPrice:93000};
 await assertSucceeds(setDoc(doc(db,'bookings','room-price'),booking));
 for(const patch of [{quoteVersion:1},{roomId:'fake'},{roomIndex:-1},{guests:5},{quantity:1},{requestedPriceUSD:80},{requestedPriceLKR:90000,totalAmount:90000,totalPrice:90000}])await assertFails(setDoc(doc(db,'bookings','room-bad'),{...booking,...patch}));
});
ruleTest('pending partners own private drafts, submit complete records and cannot self-publish',async()=>{
  await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'partners','new-owner'),{type:'Tourism',status:'Pending'}));
  const own=env.authenticatedContext('new-owner').firestore(),other=env.authenticatedContext('other').firestore(),guest=env.unauthenticatedContext().firestore();
  const draft={partnerId:'new-owner',status:'Draft',verified:false,isSample:false,catalogEligible:false,title:'Unfinished'};
  await assertSucceeds(getDoc(doc(own,'offers','draft')));
  await assertSucceeds(setDoc(doc(own,'offers','draft'),draft));
  await assertFails(getDoc(doc(other,'offers','draft')));await assertFails(getDoc(doc(guest,'offers','draft')));
  await assertFails(updateDoc(doc(own,'offers','draft'),{status:'Pending'}));
  await assertSucceeds(updateDoc(doc(own,'offers','draft'),{...validOffer,status:'Pending'}));
  await assertFails(updateDoc(doc(own,'offers','draft'),{status:'Published',verified:true,catalogEligible:true}));
  const admin=env.authenticatedContext('admin',{admin:true}).firestore();
  await assertFails(updateDoc(doc(admin,'offers','draft'),{status:'Published',verified:true,catalogEligible:true}));
  await assertSucceeds(updateDoc(doc(admin,'partners','new-owner'),{status:'Approved'}));
  await assertFails(getDoc(doc(guest,'offers','draft')));
  await assertSucceeds(updateDoc(doc(admin,'offers','draft'),{status:'Published',verified:true,catalogEligible:true}));
  await assertSucceeds(getDoc(doc(guest,'offers','draft')));
});
ruleTest('new bookings reject samples, unreviewed listings and revoked partner accounts',async()=>{
  const traveler=env.authenticatedContext('traveler').firestore();
  const request={...stayQuote,userId:'traveler',kind:'stay',offerId:'hotel',partnerId:'hotel-owner',status:'Pending'};
  await assertSucceeds(setDoc(doc(traveler,'bookings','real'),request));
  for(const patch of [{isSample:true},{catalogEligible:false}]) {
    await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'offers','hotel'),patch));
    await assertFails(setDoc(doc(traveler,'bookings','not-eligible'),request));
    await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'offers','hotel'),{isSample:false,catalogEligible:true}));
  }
  await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'partners','hotel-owner'),{status:'Rejected'}));
  await assertFails(setDoc(doc(traveler,'bookings','revoked'),request));
});
ruleTest('draft validation rejects invalid prices, fractional seats and demo publication',async()=>{
  const airline=env.authenticatedContext('airline-owner').firestore(),admin=env.authenticatedContext('admin',{admin:true}).firestore();
  const draft={airlineId:'airline-owner',status:'draft',isSample:false,catalogEligible:false};
  await assertSucceeds(setDoc(doc(airline,'routes','partial'),draft));
  await assertFails(updateDoc(doc(airline,'routes','partial'),{price:{economy:-1}}));
  await assertFails(updateDoc(doc(airline,'routes','partial'),{seats:{business:1.5}}));
  await assertFails(updateDoc(doc(admin,'routes','flight'),{isDemo:true}));
  await assertFails(updateDoc(doc(admin,'offers','hotel'),{isDemo:true}));
});
ruleTest('listing revisions remain private, retain ownership and cannot publish themselves', async () => {
  const owner = env.authenticatedContext('hotel-owner').firestore();
  const other = env.authenticatedContext('other').firestore();
  const guest = env.unauthenticatedContext().firestore();
  const admin = env.authenticatedContext('admin', {admin:true}).firestore();
  const revision = { targetCollection:'offers',targetId:'hotel',ownerId:'hotel-owner',status:'Pending',baseVersion:'',createdAt:'2026-11-14',submittedAt:'2026-11-14',notificationUpdatedAt:serverTimestamp(),payload:{...validOffer,isSample:false,catalogEligible:false,partnerId:'hotel-owner',title:'Private new photos',status:'Pending',verified:false} };
  await assertSucceeds(setDoc(doc(owner,'listingRevisions','offers_hotel'),revision));
  await assertSucceeds(getDocs(query(collection(owner,'listingRevisions'),where('ownerId','==','hotel-owner'))));
  await assertFails(getDoc(doc(guest,'listingRevisions','offers_hotel')));
  await assertFails(getDoc(doc(other,'listingRevisions','offers_hotel')));
  await assertFails(updateDoc(doc(owner,'listingRevisions','offers_hotel'),{status:'Approved'}));
  await assertFails(setDoc(doc(other,'listingRevisions','offers_hotel'),{...revision,ownerId:'other'}));
  assert.equal((await getDoc(doc(guest,'offers','hotel'))).data().title,'Hotel');
  const batch=writeBatch(admin);
  batch.update(doc(admin,'offers','hotel'),{title:'Reviewed photos',status:'Published'});
  batch.update(doc(admin,'listingRevisions','offers_hotel'),{status:'Approved'});
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(doc(guest,'offers','hotel'))).data().title,'Reviewed photos');
});
ruleTest('airline revisions cannot take another route or mutate a published schedule', async () => {
  const airline=env.authenticatedContext('airline-owner').firestore();
  const revision={targetCollection:'routes',targetId:'flight',ownerId:'airline-owner',status:'Pending',baseVersion:'',createdAt:'2026-11-14',submittedAt:'2026-11-14',payload:{...validRoute,isSample:false,catalogEligible:false,airlineId:'airline-owner',status:'pending',images:['https://res.cloudinary.com/unit/image/upload/cabin.webp']}};
  await assertSucceeds(setDoc(doc(airline,'listingRevisions','routes_flight'),revision));
  await assertFails(setDoc(doc(airline,'listingRevisions','routes_flight'),{...revision,payload:{...revision.payload,airlineId:'another'}}));
  await assertFails(setDoc(doc(airline,'listingRevisions','routes_wrong-id'),revision));
  await assertFails(updateDoc(doc(airline,'routes','flight'),{status:'pending',images:['https://example.com/unreviewed.jpg']}));
  await assertSucceeds(updateDoc(doc(airline,'routes','flight'),{status:'paused',updatedAt:'2026-11-14'}));
});
ruleTest('partner photos accept hosted Cloudinary URLs, reject local files and retain ownership and approval protection', async () => {
  const owner = env.authenticatedContext('hotel-owner').firestore();
  const other = env.authenticatedContext('other').firestore();
  const profile = doc(owner, 'partners', 'hotel-owner');
  await assertSucceeds(updateDoc(profile, { avatar: 'https://res.cloudinary.com/test/image/upload/photo.webp', avatarEmoji: 'HI', logo: 'HI', notificationUpdatedAt: serverTimestamp() }));
  await assertFails(updateDoc(profile, { avatar: 'file:///private/photo.jpg' }));
  await assertFails(updateDoc(profile, { avatar: 'data:image/png;base64,private' }));
  await assertFails(updateDoc(profile, { avatarEmoji: 'x'.repeat(17) }));
  await assertFails(updateDoc(profile, { avatar: 'https://res.cloudinary.com/test/image/upload/photo.webp', status: 'Rejected' }));
  await assertFails(updateDoc(doc(other, 'partners', 'hotel-owner'), { avatar: null }));
});
ruleTest('public catalog reads work; private records and pending listings are protected', async () => {
  const guest = env.unauthenticatedContext().firestore(), admin = env.authenticatedContext('admin',{admin:true}).firestore();
  await assertSucceeds(getDocs(query(collection(guest,'offers'), where('status','==','Published'),where('isSample','==',false),where('catalogEligible','==',true))));
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
  await assertFails(updateDoc(doc(owner,'offers','hotel'),{status:'Pending',verified:false,title:'Changed'}));
  const other = env.authenticatedContext('other').firestore();
  await assertFails(updateDoc(doc(other,'offers','hotel'),{title:'Stolen',status:'Pending',verified:false}));
});
ruleTest('booking links are checked and only assigned providers can confirm', async () => {
  const traveler = env.authenticatedContext('traveler').firestore(), provider = env.authenticatedContext('hotel-owner').firestore(), other = env.authenticatedContext('other').firestore();
  const booking = {...stayQuote,userId:'traveler',kind:'stay',offerId:'hotel',partnerId:'hotel-owner',status:'Pending'};
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
  await assertFails(updateDoc(doc(airline,'routes','flight'),{flightNo:'SC123',status:'pending'}));
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
  await assertSucceeds(setDoc(doc(traveler,'bookings','cabana'), {...stayQuote,userId:'traveler',kind:'stay',offerId:'hotel',partnerId:'hotel-owner',status:'Pending',traveler:{name:'Alice',phone:'123'}}));
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

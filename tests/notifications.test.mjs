import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationWorker } from '../notifications/worker.mjs';
import { keyFor, statusNotifications, pushMessage, retryAt } from '../notifications/events.mjs';
import { encodeValue, decodeValue } from '../scripts/seed-references.mjs';

class MemoryStore {
  constructor() { this.prefix='projects/demo-skyconnect/databases/(default)/documents/';this.rows=new Map();this.time=Date.parse('2026-10-18T00:00:00Z'); }
  put(path,data,precondition) { return {update:{name:this.prefix+path,fields:encodeValue(data).mapValue.fields},...(precondition?{currentDocument:precondition}:{})}; }
  remove(path,updateTime) {return {delete:this.prefix+path,currentDocument:{updateTime}};}
  async get(path){return structuredClone(this.rows.get(path)||null);}
  async commit(writes){
    for(const w of writes){const old=this.rows.get((w.update?.name||w.delete).slice(this.prefix.length));if(w.currentDocument?.exists===false&&old||w.currentDocument?.updateTime&&old?.updateTime!==w.currentDocument.updateTime)throw Object.assign(new Error('precondition'),{status:409});}
    const commitTime=new Date(++this.time).toISOString();
    for(const w of writes){const name=w.update?.name||w.delete,path=name.slice(this.prefix.length);if(w.delete){this.rows.delete(path);continue;}const value=decodeValue({mapValue:{fields:w.update.fields}});const old=this.rows.get(path);this.rows.set(path,{path,name,updateTime:commitTime,data:w.updateMask?{...old?.data,...value}:value});}
    return {commitTime};
  }
  async devices(uid){return [...this.rows.values()].filter(r=>r.path.startsWith(`users/${uid}/devices/`));}
  async query(q,readTime){
    let rows=[...this.rows.values()].filter(r=>q.from[0].allDescendants?r.path.split('/').at(-2)===q.from[0].collectionId:r.path.split('/').length===2&&r.path.split('/')[0]===q.from[0].collectionId);
    if(readTime)rows=rows.filter(r=>r.updateTime<=readTime);
    const value=v=>v?.stringValue??v?.timestampValue??v?.referenceValue;
    function filter(r,f){if(f.compositeFilter)return f.compositeFilter.filters.every(g=>filter(r,g));const x=f.fieldFilter,actual=r.data[x.field.fieldPath],expected=value(x.value);return x.op==='EQUAL'?actual===expected:x.op==='GREATER_THAN_OR_EQUAL'?actual>=expected:actual<=expected;}
    if(q.where)rows=rows.filter(r=>filter(r,q.where));
    const fields=q.orderBy?.map(o=>o.field.fieldPath)||['__name__'];
    const tuple=r=>fields.map(f=>f==='__name__'?r.name:r.data[f]);
    const compare=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]<b[i]?-1:1;return 0;};
    rows.sort((a,b)=>compare(tuple(a),tuple(b)));
    if(q.startAt)rows=rows.filter(r=>compare(tuple(r),q.startAt.values.map(value))>0);
    return structuredClone(rows.slice(0,q.limit||100));
  }
}
function setup(send=async()=>{}) {
  const store=new MemoryStore();
  const worker=new NotificationWorker({store,send,account:async uid=>['traveler','partner','admin'].includes(uid)?{uid,customClaims:{admin:uid==='admin'}}:null,adminUids:['admin'],clock:()=>store.time,log:()=>{}});
  return {store,worker};
}

test('notifications derive recipients from authoritative ownership; samples and unchanged statuses are skipped',()=>{
  const b={status:'Pending',userId:'traveler',partnerId:'partner'};
  assert.deepEqual(statusNotifications('bookings','b',b,null).map(n=>[n.uid,n.app]),[['traveler','traveler'],['partner','partner']]);
  assert.equal(statusNotifications('bookings','b',b,{status:'Pending'}).length,0);
  assert.equal(statusNotifications('bookings','b',{...b,isDemo:true},null).length,0);
  assert.equal(statusNotifications('offers','x',{status:'Published',partnerId:'outside/path'},null).length,0);
  assert.equal(statusNotifications('partners','partner',{status:'Pending'},null,['admin'])[0].uid,'admin');
  const msg=pushMessage('token',keyFor('event'),{...b,uid:'traveler',app:'traveler',title:'Title',body:'Body'});
  assert.equal(msg.apns.headers['apns-collapse-id'].length,64);
  assert.equal(msg.data.recipientUid,'traveler');
});

test('first worker run baselines old data without replay; subsequent changes persist one inbox per recipient',async()=>{
  const {store,worker}=setup();
  await store.commit([store.put('partners/partner',{status:'Approved',uid:'partner'})]);
  await worker.tick();
  assert.equal([...store.rows.keys()].filter(p=>p.includes('/notifications/')).length,0);
  const time=new Date(store.time+1).toISOString();
  await store.commit([store.put('bookings/new',{status:'Pending',userId:'traveler',partnerId:'partner',notificationUpdatedAt:time})]);
  const tick=await worker.tick();
  assert.equal(tick.changes,1);
  assert.equal([...store.rows.keys()].filter(p=>p.includes('/notifications/')).length,2);
  assert.equal((await worker.tick()).changes,0);
  assert.equal([...store.rows.keys()].filter(p=>p.includes('/notifications/')).length,2);
});

test('worker lease prevents two senders and releases cleanly',async()=>{
  const {store,worker}=setup();await worker.tick();
  const other=new NotificationWorker({store,send:async()=>{},account:async()=>null,clock:()=>store.time,log:()=>{}});
  assert.deepEqual(await other.tick(),{skipped:'another-worker-holds-lease'});
  await worker.release();
  assert.equal((await other.tick()).changes,0);
});

test('retries only failed devices, prunes expired tokens, and preserves a concurrent read flag',async()=>{
  const sent=[];
  const {store,worker}=setup(async msg=>{sent.push(msg.token);if(msg.token==='expired')throw Object.assign(new Error('expired'),{code:'messaging/registration-token-not-registered'});if(msg.token==='temporary'&&sent.filter(t=>t==='temporary').length===1)throw Object.assign(new Error('retry'),{code:'messaging/server-unavailable'});const old=await store.get('users/traveler/notifications/n');await store.commit([store.put(old.path,{...old.data,read:true,readAt:'read'})]);});
  const n={uid:'traveler',app:'traveler',title:'Title',body:'Body',createdAt:new Date(store.time).toISOString(),read:false,pushState:'pending',retryCount:0,nextAttemptAt:new Date(store.time).toISOString(),deviceResults:{}};
  await store.commit([store.put('users/traveler/notifications/n',n),...['ok','expired','temporary'].map(token=>store.put(`users/traveler/devices/${token}`,{token,app:'traveler',enabled:true}))]);
  await worker.deliveries();
  let inbox=await store.get('users/traveler/notifications/n');
  assert.equal(inbox.data.pushState,'pending');assert.equal(inbox.data.read,true);assert.equal(await store.get('users/traveler/devices/expired'),null);
  store.time=Date.parse(inbox.data.nextAttemptAt)+1;
  await worker.deliveries();inbox=await store.get('users/traveler/notifications/n');
  assert.equal(inbox.data.pushState,'complete');assert.equal(sent.filter(t=>t==='ok').length,1);assert.equal(sent.filter(t=>t==='temporary').length,2);
  assert.ok(Date.parse(retryAt(20,store.time))<=store.time+3600000);
});

test('disabled preferences prevent sends while retaining inbox history',async()=>{
  const {store,worker}=setup(async()=>assert.fail('Must not send'));
  await store.commit([store.put('users/traveler/settings/notifications',{traveler:false}),store.put('users/traveler/notifications/n',{uid:'traveler',app:'traveler',pushState:'pending',nextAttemptAt:new Date(store.time).toISOString(),read:false})]);
  await worker.deliveries();assert.equal((await store.get('users/traveler/notifications/n')).data.pushState,'disabled');
});

test('admin queue is reauthorized before dispatch; ordinary accounts cannot forge requests',async()=>{
  const {store,worker}=setup();
  const request={uid:'traveler',app:'traveler',title:'Notice',body:'A real message',state:'pending'};
  await store.commit([store.put('notificationRequests/admin',{...request,createdBy:'admin'}),store.put('notificationRequests/forged',{...request,createdBy:'partner'})]);
  await worker.requests();
  assert.equal((await store.get('notificationRequests/admin')).data.state,'processed');
  assert.equal((await store.get('notificationRequests/forged')).data.state,'rejected');
  assert.equal([...store.rows.keys()].filter(p=>p.includes('/notifications/')).length,1);
  assert.equal(await worker.requests(),0);
});

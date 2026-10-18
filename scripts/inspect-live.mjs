import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { cliCredential, cloudRequest } from './cli-session.mjs';

const [projectId, uid] = process.argv.slice(2);
if (!projectId || !uid) throw new Error('Usage: node scripts/inspect-live.mjs PROJECT_ID ADMIN_AUTH_UID');
initializeApp({ projectId, credential: cliCredential });
const jobs = {
  administrator: async () => { const u = await getAuth().getUser(uid); return { uid: u.uid, email: u.email, disabled: u.disabled, claims: u.customClaims || {} }; },
  database: async () => { const db = await cloudRequest(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`); return { name: db.name, locationId: db.locationId, type: db.type }; },
  collections: () => cloudRequest(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:listCollectionIds`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ pageSize:100 }) }),
  storageBuckets: async () => { const result = await cloudRequest(`https://storage.googleapis.com/storage/v1/b?project=${projectId}`); return (result.items || []).map(b => ({ name:b.name, location:b.location })); },
  firebaseApps: async () => { const result = await cloudRequest(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`); return (result.apps || []).map(a=>({ appId:a.appId, displayName:a.displayName })); },
};
await Promise.all(Object.entries(jobs).map(async ([name, job]) => {
  try { console.log(JSON.stringify({ check:name, ok:true, result:await job() })); }
  catch (error) { console.log(JSON.stringify({ check:name, ok:false, status:error.status, code:error.code, message:error.message })); }
}));

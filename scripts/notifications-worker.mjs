import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { cliCredential, cloudRequest } from './cli-session.mjs';
import { NotificationStore } from '../notifications/store.mjs';
import { NotificationWorker } from '../notifications/worker.mjs';

const projectId = process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) throw new Error('Set GOOGLE_CLOUD_PROJECT. See NOTIFICATIONS.md.');
const useCli = process.argv.includes('--firebase-cli');
const app = initializeApp({ projectId, credential: useCli ? cliCredential : applicationDefault() });
const credential = app.options.credential;
const request = useCli ? cloudRequest : async (url, options = {}) => {
  const token = await credential.getAccessToken();
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token.access_token}`, ...options.headers }, signal: AbortSignal.timeout(30000) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error?.message || 'Cloud request failed'), { status: response.status });
  return result;
};
const worker = new NotificationWorker({
  store: new NotificationStore(projectId, request),
  account: async uid => { if(typeof uid !== 'string' || !uid || uid.length > 128 || uid.includes('/')) return null; try { const user = await getAuth(app).getUser(uid); return user.disabled ? null : user; } catch (e) { if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-uid') return null; throw e; } },
  send: message => getMessaging(app).send(message),
  adminUids: (process.env.NOTIFICATION_ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean),
});
const interval = Number(process.env.NOTIFICATION_POLL_MS || 60000);
if (!Number.isSafeInteger(interval) || interval < 60000 || interval > 43200000) throw new Error('NOTIFICATION_POLL_MS must be an integer between 60000 and 43200000.');
console.log(JSON.stringify({ event: 'worker-start', projectId, pollMs: interval }));
let stopping = false, wake;
const stop = () => { stopping = true; wake?.(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
try {
  do {
    try { console.log(JSON.stringify({ event: 'tick', ...await worker.tick() })); }
    catch (error) { console.error(JSON.stringify({ event: 'worker-error', code: error.code || error.status || 'unknown', message: error.status ? error.message : 'Check backend credentials, FCM setup and Firestore indexes.' })); if (process.argv.includes('--once')) throw error; }
    if (process.argv.includes('--once') || stopping) break;
    await new Promise(resolve => { const timer = setTimeout(resolve, interval); wake = () => { clearTimeout(timer); resolve(); }; });
  } while (!stopping);
} finally { await worker.release(); }

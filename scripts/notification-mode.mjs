import { cloudRequest } from './cli-session.mjs';

const [projectId, mode] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]+$/.test(projectId || '') || !['worker', 'functions'].includes(mode)) {
  throw new Error('Usage: node scripts/notification-mode.mjs PROJECT_ID worker|functions [--apply]');
}
const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
// Read the lease and configuration together, and use optimistic preconditions
// so activation fails if a worker starts while this command is running.
const names = ['notificationWorker/lease', 'notificationWorker/config'].map(path => `${base}/${path}`.replace('https://firestore.googleapis.com/v1/', ''));
const rows = await cloudRequest(`${base}:batchGet`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documents: names }) });
if (!Array.isArray(rows)) throw new Error('Unexpected Firestore response.');
const lease = rows.find(row => row.found?.name === names[0])?.found;
const config = rows.find(row => row.found?.name === names[1])?.found;
if (Number(lease?.fields?.until?.integerValue || lease?.fields?.until?.doubleValue || 0) > Date.now()) {
  throw new Error('Stop the worker with Ctrl+C first and allow it to release its lease.');
}
console.log(JSON.stringify({ projectId, mode, apply: process.argv.includes('--apply'), note: 'Cloud Functions must already be deployed before activating functions mode.' }));
if (process.argv.includes('--apply')) {
  const writes = [{ update: { name: names[1], fields: { ...config?.fields, mode: { stringValue: mode } } },
    currentDocument: config ? { updateTime: config.updateTime } : { exists: false } }];
  // A lease-only transaction check: preserve this document unchanged while
  // verifying the stopped worker has not acquired it again.
  writes.push({ update: { name: names[0], fields: lease?.fields || { until: { integerValue: '0' } } },
    currentDocument: lease ? { updateTime: lease.updateTime } : { exists: false } });
  await cloudRequest(`${base}:commit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) });
  console.log(JSON.stringify({ activated: mode }));
}

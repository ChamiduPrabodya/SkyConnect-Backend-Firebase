import fs from 'node:fs/promises';
import { cloudRequest } from './cli-session.mjs';

const [projectId] = process.argv.slice(2);
if (!projectId) throw new Error('Usage: node scripts/backup-firestore.mjs PROJECT_ID');
const api = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/collectionGroups/-`;
async function pages(url, key) {
  const records = [];
  let pageToken;
  do {
    const next = new URL(url);
    if (pageToken) next.searchParams.set('pageToken', pageToken);
    const result = await cloudRequest(next);
    records.push(...(result[key] || []));
    pageToken = result.nextPageToken;
  } while (pageToken);
  return records;
}
const release = await cloudRequest(`https://firebaserules.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/releases/cloud.firestore`);
const [ruleset, indexes, fields] = await Promise.all([
  cloudRequest(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`),
  pages(`${api}/indexes`, 'indexes'),
  pages(`${api}/fields?filter=${encodeURIComponent('indexConfig.usesAncestorConfig=false OR ttlConfig:*')}`, 'fields'),
]);
const directory = new URL(`../backups.local/${projectId}-${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url);
await fs.mkdir(directory, { recursive: true });
await fs.writeFile(new URL('firestore.json', directory), JSON.stringify({ projectId, capturedAt: new Date().toISOString(), release, ruleset, indexes, fields }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ backup: directory.pathname, ruleset: release.rulesetName, indexes: indexes.length, fieldOverrides: fields.length }));

import fs from 'node:fs/promises';
import { cloudRequest } from './cli-session.mjs';

const [projectId] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]+$/.test(projectId || '')) throw new Error('Usage: node scripts/check-privacy-deployment.mjs PROJECT_ID');
const release = await cloudRequest(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`);
const rules = await cloudRequest(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
const expected = await fs.readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const fields = await Promise.all(['uid', 'sourceId'].map(async name => {
  const field = await cloudRequest(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/notifications/fields/${name}`);
  return { field: name, states: (field.indexConfig?.indexes || []).filter(index => index.queryScope === 'COLLECTION_GROUP').map(index => index.state) };
}));
const billing = await cloudRequest(`https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`);
const result = { projectId, rulesMatch: rules.source?.files?.some(file => file.content === expected) || false,
  deletionIndexes: fields, billingEnabled: billing.billingEnabled === true };
console.log(JSON.stringify(result));
if (!result.rulesMatch || fields.some(field => !field.states.includes('READY'))) process.exitCode = 1;

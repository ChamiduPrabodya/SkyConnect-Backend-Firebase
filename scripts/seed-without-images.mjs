import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { encodeValue, decodeValue } from './seed-references.mjs';

const collections = ['destinations', 'packages', 'flights', 'offers', 'partners', 'legacySamples'];
const mediaKey = /^(image|images|photo|photos|logo|logos|thumbnail|thumbnails|avatar|avatars|gallery|coverImage|coverPhoto|SAMPLE_PHOTO_PRESETS)$/i;
export function withoutImages(value) {
  if (Array.isArray(value)) return value.map(withoutImages);
  if (!value || typeof value !== 'object') return typeof value === 'string' && /^(seed-asset:|file:|content:|data:image\/)/i.test(value) ? null : value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mediaKey.test(key) ? (Array.isArray(item) ? [] : null) : withoutImages(item)]));
}
export function prepareWithoutImages(catalog) {
  const documents = [];
  for (const collection of collections) {
    const ids = new Set();
    if (!Array.isArray(catalog[collection])) throw new Error(`Missing seed collection ${collection}.`);
    for (const original of catalog[collection]) {
      if (!original.id || original.id.includes('/') || ids.has(original.id)) throw new Error(`Invalid or duplicate ID in ${collection}.`);
      ids.add(original.id);
      const record = withoutImages(original);
      const encoded = encodeValue(record);
      if (!isDeepStrictEqual(decodeValue(encoded), record)) throw new Error(`Serialization changed ${collection}/${record.id}.`);
      if (Buffer.byteLength(JSON.stringify(encoded)) >= 900000) throw new Error(`Seed document too large: ${collection}/${record.id}.`);
      documents.push({ collection, id: record.id, record });
    }
  }
  if (!documents.length || documents.length > 500) throw new Error('Expected 1–500 seed documents.');
  return documents;
}
async function readDocuments(base, names, request) {
  const rows = await request(`${base}:batchGet`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documents: names }) });
  if (!Array.isArray(rows)) throw new Error('Unexpected batchGet response.');
  const found = new Map(), seen = new Set();
  for (const row of rows) {
    if (row.found) { seen.add(row.found.name); found.set(row.found.name, decodeValue({ mapValue: { fields: row.found.fields || {} } })); }
    if (row.missing) seen.add(row.missing);
  }
  if (names.some(name => !seen.has(name))) throw new Error('Preflight did not return every requested document.');
  return found;
}
export async function migrateWithoutImages(projectId, catalog, request, apply = false) {
  if (!/^[a-z][a-z0-9-]+$/.test(projectId)) throw new Error('Provide a valid project ID.');
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const prefix = `projects/${projectId}/databases/(default)/documents/`;
  const documents = prepareWithoutImages(catalog).map(d => ({ ...d, name: `${prefix}${d.collection}/${d.id}` }));
  const names = documents.map(d => d.name);
  const existing = await readDocuments(base, names, request);
  const missing = documents.filter(d => !existing.has(d.name));
  const matches = (actual, expected) => isDeepStrictEqual(withoutImages(Object.fromEntries(Object.keys(expected).map(key => [key, actual[key]]))), expected);
  const different = documents.filter(d => existing.has(d.name) && !matches(existing.get(d.name), d.record)).map(d => `${d.collection}/${d.id}`);
  if (apply && missing.length) {
    const migratedAt = new Date().toISOString();
    const writes = missing.map(d => ({ update: { name: d.name, fields: encodeValue({ ...d.record, migratedAt, seedImageMode: 'omitted' }).mapValue.fields }, currentDocument: { exists: false } }));
    const body = JSON.stringify({ writes });
    if (Buffer.byteLength(body) >= 9000000) throw new Error('Seed commit exceeds its size budget.');
    // One atomic create-only commit: a concurrent existing ID aborts all writes.
    await request(`${base}:commit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  }
  if (apply) {
    const actual = await readDocuments(base, names, request);
    for (const d of documents) {
      const stored = actual.get(d.name);
      if (!stored) throw new Error(`Missing document after migration: ${d.collection}/${d.id}`);
      if (!existing.has(d.name) && (!matches(stored, d.record) || !isDeepStrictEqual(withoutImages(stored), stored))) throw new Error(`Verification failed: ${d.collection}/${d.id}`);
      if (existing.has(d.name) && !isDeepStrictEqual(stored, existing.get(d.name))) throw new Error(`Existing document changed during migration: ${d.collection}/${d.id}`);
    }
  }
  return {
    apply, project: projectId, documents: documents.length,
    collections: Object.fromEntries(collections.map(name => [name, { total: documents.filter(d => d.collection === name).length, new: missing.filter(d => d.collection === name).length }])),
    created: apply ? missing.length : 0, wouldCreate: apply ? 0 : missing.length,
    preserved: existing.size, preservedWithDifferentContent: different, verified: apply,
    mediaUploads: 0,
  };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const catalog = JSON.parse(await fs.readFile(new URL('../seed/catalog.json', import.meta.url), 'utf8'));
  const apply = process.argv.includes('--apply');
  if (apply || process.argv.includes('--check-live')) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) throw new Error('Set GOOGLE_CLOUD_PROJECT explicitly.');
    const { cloudRequest } = await import('./cli-session.mjs');
    console.log(JSON.stringify(await migrateWithoutImages(projectId, catalog, cloudRequest, apply), null, 2));
  } else {
    const documents = prepareWithoutImages(catalog);
    console.log(JSON.stringify({ apply: false, documents: documents.length, collections: Object.fromEntries(collections.map(name => [name, documents.filter(d => d.collection === name).length])), mediaUploads: 0, referenceData: 'Already migrated separately; unchanged.' }, null, 2));
  }
}

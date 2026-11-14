import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { encodeValue, decodeValue } from './seed-references.mjs';
import { cloudinaryConfig, uploadCatalogPhoto } from '../functions/src/cloudinary.mjs';

const collections = ['destinations', 'packages', 'flights', 'offers', 'partners'];
const mediaKeys = new Set(['image', 'images', 'photo', 'photos', 'logo', 'thumbnail', 'gallery', 'coverImage']);
const assetPattern = /^seed-asset:\/\/([a-f0-9]{24}\.(?:jpg|jpeg|png|webp))$/;
const empty = value => value == null || value === '' || (Array.isArray(value) && value.length === 0);
export function assetNames(value, names = new Set()) {
  if (typeof value === 'string' && assetPattern.test(value)) names.add(value.match(assetPattern)[1]);
  else if (Array.isArray(value)) value.forEach(item => assetNames(item, names));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => assetNames(item, names));
  return names;
}
function replaceAssets(value, urls) {
  if (typeof value === 'string' && assetPattern.test(value)) {
    const file = value.match(assetPattern)[1];
    if (!urls[file]) throw new Error(`Missing uploaded URL for ${file}.`);
    return urls[file];
  }
  if (Array.isArray(value)) return value.map(item => replaceAssets(item, urls));
  return value;
}
export function mediaPatch(current, seed, urls) {
  const patch = {};
  for (const [key, original] of Object.entries(seed)) {
    if (!mediaKeys.has(key) || !assetNames(original).size) continue;
    // Preserve every nonempty custom image. Only refill omitted/seed placeholders.
    if (empty(current[key]) || assetNames(current[key]).size) {
      const replacement = replaceAssets(empty(current[key]) ? original : current[key], urls);
      if (!isDeepStrictEqual(current[key], replacement)) patch[key] = replacement;
    }
  }
  if (Array.isArray(current.activities) && Array.isArray(seed.activities)) {
    const originals = new Map(seed.activities.filter(a => a.id).map(a => [a.id, a]));
    const activities = current.activities.map(activity => {
      const original = originals.get(activity.id);
      return original ? { ...activity, ...mediaPatch(activity, original, urls) } : activity;
    });
    if (!isDeepStrictEqual(activities, current.activities)) patch.activities = activities;
  }
  return patch;
}
export function seedDocuments(catalog) {
  return collections.flatMap(collection => (catalog[collection] || []).map(seed => {
    if (!seed.id || !/^[A-Za-z0-9_ -]+$/.test(seed.id)) throw new Error('Invalid seed document ID.');
    return { path: `${collection}/${seed.id}`, seed };
  }));
}
export async function readCatalog(project, catalog, request) {
  if (typeof project !== 'string' || !/^[a-z][a-z0-9-]+$/.test(project)) throw new Error('Set a valid GOOGLE_CLOUD_PROJECT or FIREBASE_PROJECT_ID.');
  const prefix = `projects/${project}/databases/(default)/documents/`;
  const base = `https://firestore.googleapis.com/v1/${prefix.slice(0, -1)}`;
  const docs = seedDocuments(catalog);
  const rows = await request(`${base}:batchGet`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents: docs.map(doc => prefix + doc.path) }) });
  if (!Array.isArray(rows) || rows.length !== docs.length) throw new Error('Incomplete Firestore read; migration stopped.');
  const found = new Map(rows.filter(row => row.found).map(row => [row.found.name, row.found]));
  const seen = new Set(rows.map(row => row.found?.name || row.missing));
  if (docs.some(doc => !seen.has(prefix + doc.path))) throw new Error('Firestore did not return every requested document.');
  return { base, documents: docs.flatMap(doc => {
    const snapshot = found.get(prefix + doc.path);
    return snapshot ? [{ ...doc, snapshot, current: decodeValue({ mapValue: { fields: snapshot.fields || {} } }) }] : [];
  }), missing: docs.filter(doc => !found.has(prefix + doc.path)).map(doc => doc.path) };
}

export async function applyMediaPlan(plan, urls, request, backup) {
  const changed = plan.documents.map(doc => ({ ...doc, patch: mediaPatch(doc.current, doc.seed, urls) }))
    .filter(doc => Object.keys(doc.patch).length);
  if (!changed.length) return { updated: 0, verified: true };
  // Complete the local backup BEFORE any live write. Include updateTimes for review.
  await backup(changed.map(doc => doc.snapshot));
  const writes = changed.map(doc => ({ update: { name: doc.snapshot.name, fields: encodeValue(doc.patch).mapValue.fields },
    updateMask: { fieldPaths: Object.keys(doc.patch) }, currentDocument: { updateTime: doc.snapshot.updateTime } }));
  await request(`${plan.base}:commit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) });
  const rows = await request(`${plan.base}:batchGet`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents: changed.map(doc => doc.snapshot.name) }) });
  const actual = new Map(rows.filter(row => row.found).map(row => [row.found.name, decodeValue({ mapValue: { fields: row.found.fields || {} } })]));
  for (const doc of changed) if (!isDeepStrictEqual(actual.get(doc.snapshot.name), { ...doc.current, ...doc.patch })) {
    throw new Error(`Verification changed unexpectedly at ${doc.path}; review the backup before retrying.`);
  }
  return { updated: changed.length, verified: true };
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(new URL('../seed/catalog.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(await fs.readFile(new URL('../seed/assets.json', import.meta.url), 'utf8'));
  const allFiles = [...assetNames(seedDocuments(catalog).map(doc => doc.seed))].sort();
  let bytes = 0;
  for (const filename of allFiles) {
    if (!manifest[filename]) throw new Error(`Asset manifest missing ${filename}.`);
    bytes += (await fs.stat(new URL(`../seed/assets/${filename}`, import.meta.url))).size;
  }
  console.log(JSON.stringify({ mode: 'offline-preview', assets: allFiles.length, bytes, estimatedMB: +(bytes / 1000000).toFixed(2), writes: 0 }));
  const apply = process.argv.includes('--apply');
  if (!apply && !process.argv.includes('--check-live')) return;
  const { cloudRequest } = await import('./cli-session.mjs');
  const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
  const plan = await readCatalog(project, catalog, cloudRequest);
  const placeholders = Object.fromEntries(allFiles.map(file => [file, `https://preview.invalid/${file}`]));
  const patches = plan.documents.map(doc => mediaPatch(doc.current, doc.seed, placeholders));
  const needed = new Set();
  // Recover exact filenames from preview URLs: only assets needed by live records.
  function collect(value) {
    if (typeof value === 'string' && value.startsWith('https://preview.invalid/')) needed.add(value.split('/').pop());
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  }
  patches.forEach(collect);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'live-preview', wouldUpdate: patches.filter(p => Object.keys(p).length).length,
    assetsNeeded: needed.size, missingRecordsSkipped: plan.missing, preservesCustomImages: true }));
  if (!apply || !needed.size) return;
  const config = cloudinaryConfig();
  const urls = {};
  for (const filename of needed) {
    urls[filename] = await uploadCatalogPhoto(await fs.readFile(new URL(`../seed/assets/${filename}`, import.meta.url)), filename,
      manifest[filename].contentType, config);
    console.log(JSON.stringify({ uploadedOrReused: Object.keys(urls).length, of: needed.size }));
  }
  // Use preview placeholders only for preserved fields which will never be written.
  const result = await applyMediaPlan(plan, { ...placeholders, ...urls }, cloudRequest, async snapshots => {
    const directory = new URL('../backups.local/', import.meta.url);
    await fs.mkdir(directory, { recursive: true });
    const backup = new URL(`cloudinary-${Date.now()}.json`, directory);
    await fs.writeFile(backup, JSON.stringify({ project, snapshots }, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ backup: backup.pathname.split('/').pop(), documents: snapshots.length }));
  });
  console.log(JSON.stringify(result));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => { console.error(error.name === 'TypeError' ? 'Media connection failed; check network and credentials.' : error.message); process.exitCode = 1; });
}

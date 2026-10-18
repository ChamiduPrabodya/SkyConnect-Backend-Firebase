import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await fs.readFile(path.join(base, 'seed/catalog.json'), 'utf8'));
const assets = JSON.parse(await fs.readFile(path.join(base, 'seed/assets.json'), 'utf8'));
const apply = process.argv.includes('--apply');
console.log(JSON.stringify({ apply, project: process.env.GOOGLE_CLOUD_PROJECT || '(unset)', collections: Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])), assets: Object.keys(assets).length }, null, 2));
if (!apply) process.exit(0);
const projectId = process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) throw new Error('Set GOOGLE_CLOUD_PROJECT explicitly. Preview makes no network calls.');
const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const { getStorage } = await import('firebase-admin/storage');
const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
const assetBase = process.env.SEED_ASSET_BASE_URL;
if (!emulator && !bucketName && !assetBase) throw new Error('Set FIREBASE_STORAGE_BUCKET to upload bundled media, or SEED_ASSET_BASE_URL for an existing HTTPS media host.');
initializeApp({ projectId, ...(emulator ? {} : { credential: applicationDefault() }), ...(bucketName ? { storageBucket: bucketName } : {}) });
const urls = new Map();
for (const [name, meta] of Object.entries(assets)) {
  if (assetBase) { urls.set(name, `${assetBase.replace(/\/$/, '')}/${name}`); continue; }
  if (emulator) { urls.set(name, `https://example.invalid/seed/${name}`); continue; }
  const bucket = getStorage().bucket();
  const destination = `catalog/seed/${name}`;
  const file = bucket.file(destination);
  const [exists] = await file.exists();
  if (!exists) await bucket.upload(path.join(base,'seed/assets',name), { destination, metadata: { contentType: meta.contentType } });
  const [metadata] = await file.getMetadata();
  const token = metadata.metadata?.firebaseStorageDownloadTokens?.split(',')[0] || randomUUID();
  if (!metadata.metadata?.firebaseStorageDownloadTokens) await file.setMetadata({ metadata: { ...metadata.metadata, firebaseStorageDownloadTokens: token } });
  urls.set(name, `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media&token=${token}`);
}
const rewrite = value => typeof value === 'string' && value.startsWith('seed-asset://') ? urls.get(value.slice(13)) : Array.isArray(value) ? value.map(rewrite) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v)])) : value;
const db = getFirestore();
for (const [collection, records] of Object.entries(data)) {
  for (const record of records) {
    const ref = db.collection(collection).doc(record.id);
    try { await ref.create({ ...rewrite(record), migratedAt: new Date().toISOString() }); }
    catch (error) { if (error.code === 6 || error.code === 'already-exists') console.log(`Kept existing ${collection}/${record.id}`); else throw error; }
  }
}
console.log('Migration complete. Existing documents were preserved. Legacy samples are private archives, not registered accounts.');

import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

// JSON-only Firestore values: preserve nested maps, arrays, numbers and nulls.
export function encodeValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    if (value.some(Array.isArray)) throw new Error('Firestore does not support directly nested arrays.');
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)])) } };
  }
  throw new Error('Unsupported reference-data value.');
}

export function decodeValue(value) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decodeValue(item)]));
  throw new Error('Unexpected reference-data value returned by Firestore.');
}

export function prepareReferences(catalog) {
  const records = catalog.referenceData;
  if (!Array.isArray(records) || !records.length) throw new Error('No reference data found.');
  const ids = new Set();
  for (const record of records) {
    if (typeof record.id !== 'string' || !record.id || record.id.includes('/') || ids.has(record.id)) throw new Error('Reference IDs must be unique document IDs.');
    ids.add(record.id);
    if (/seed-asset:\/\/|file:\/\/|content:\/\//i.test(JSON.stringify(record))) throw new Error(`Reference ${record.id} depends on unpublished media.`);
    const encoded = encodeValue(record);
    if (!isDeepStrictEqual(decodeValue(encoded), record)) throw new Error(`Serialization changed ${record.id}.`);
  }
  return records;
}

export async function seedReferences(projectId, records, request) {
  if (!/^[a-z][a-z0-9-]+$/.test(projectId)) throw new Error('Provide a valid project ID.');
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/referenceData`;
  const results = [];
  for (const record of prepareReferences({ referenceData: records })) {
    let status = 'created';
    try {
      await request(`${base}?documentId=${encodeURIComponent(record.id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: encodeValue({ ...record, migratedAt: new Date().toISOString() }).mapValue.fields }),
      });
    } catch (error) {
      if (error.status !== 409) throw error;
      status = 'preserved';
    }
    const stored = await request(`${base}/${encodeURIComponent(record.id)}`);
    const actual = decodeValue({ mapValue: { fields: stored.fields || {} } });
    if (!isDeepStrictEqual({ id: actual.id, items: actual.items }, { id: record.id, items: record.items })) {
      throw new Error(`Existing referenceData/${record.id} differs from the seed; it was preserved and needs review.`);
    }
    results.push({ id: record.id, status, verified: true });
  }
  return results;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const catalog = JSON.parse(await fs.readFile(new URL('../seed/catalog.json', import.meta.url), 'utf8'));
  const records = prepareReferences(catalog);
  const apply = process.argv.includes('--apply');
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  console.log(JSON.stringify({ apply, project: projectId || '(unset)', collection: 'referenceData', documents: records.map(r => r.id), mediaUploads: 0 }, null, 2));
  if (apply) {
    if (!projectId) throw new Error('Set GOOGLE_CLOUD_PROJECT explicitly before applying.');
    const { cloudRequest } = await import('./cli-session.mjs');
    const results = await seedReferences(projectId, records, cloudRequest);
    console.log(JSON.stringify({ results, message: 'Reference data verified. Catalog records and image migration remain pending.' }, null, 2));
  }
}

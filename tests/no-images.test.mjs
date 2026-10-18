import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { withoutImages, prepareWithoutImages, migrateWithoutImages } from '../scripts/seed-without-images.mjs';
import { encodeValue, decodeValue } from '../scripts/seed-references.mjs';

test('image-free catalog preserves locations, prices, relationships and all 187 activities', async () => {
  const catalog = JSON.parse(await fs.readFile(new URL('../seed/catalog.json', import.meta.url), 'utf8'));
  const documents = prepareWithoutImages(catalog);
  assert.equal(documents.length, 50);
  assert.equal(documents.filter(d => d.collection === 'destinations').reduce((n, d) => n + d.record.activities.length, 0), 187);
  assert.ok(!JSON.stringify(documents).includes('seed-asset://'));
  assert.ok(catalog.destinations[0].image.startsWith('seed-asset://'), 'Original image manifest is preserved');
  for (const d of documents.filter(d => d.collection !== 'legacySamples')) {
    const original = catalog[d.collection].find(r => r.id === d.id);
    for (const field of ['coordinates', 'price', 'partnerId', 'airlineId', 'isSample', 'status', 'destinationIds']) assert.deepEqual(d.record[field], original[field]);
  }
  assert.deepEqual(withoutImages({ image: 'https://photo.example/a.jpg', images: ['x'], child: { logo: 'x', name: 'Business' } }), { image: null, images: [], child: { logo: null, name: 'Business' } });
});

test('image-free migration atomically creates missing documents and preserves existing content', async () => {
  const catalog = Object.fromEntries(['destinations', 'packages', 'flights', 'offers', 'partners', 'legacySamples'].map(c => [c, []]));
  catalog.destinations = [{ id: 'new', image: 'seed-asset://photo.jpg', name: 'Ella' }, { id: 'existing', name: 'Seed name' }];
  const prefix = 'projects/demo-skyconnect/databases/(default)/documents/';
  const stored = new Map([[prefix + 'destinations/existing', { id: 'existing', name: 'Live name', image: 'https://photo.example/real.jpg' }]]);
  let commits = 0;
  const request = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith(':batchGet')) return body.documents.map(name => stored.has(name) ? { found: { name, fields: encodeValue(stored.get(name)).mapValue.fields } } : { missing: name });
    assert.ok(url.endsWith(':commit'));
    commits++;
    assert.equal(body.writes.length, 1);
    for (const w of body.writes) {
      assert.deepEqual(w.currentDocument, { exists: false });
      assert.ok(!stored.has(w.update.name));
      stored.set(w.update.name, decodeValue({ mapValue: { fields: w.update.fields } }));
    }
    return {};
  };
  const preview = await migrateWithoutImages('demo-skyconnect', catalog, request);
  assert.equal(preview.wouldCreate, 1);
  assert.equal(commits, 0);
  const applied = await migrateWithoutImages('demo-skyconnect', catalog, request, true);
  assert.equal(applied.created, 1);
  assert.deepEqual(applied.preservedWithDifferentContent, ['destinations/existing']);
  assert.equal(stored.get(prefix + 'destinations/new').image, null);
  assert.equal(stored.get(prefix + 'destinations/existing').image, 'https://photo.example/real.jpg');
  const rerun = await migrateWithoutImages('demo-skyconnect', catalog, request, true);
  assert.equal(rerun.created, 0);
  assert.equal(commits, 1);
});

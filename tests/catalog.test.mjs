import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(base, 'seed/catalog.json')));
const assets = JSON.parse(fs.readFileSync(path.join(base, 'seed/assets.json')));
test('migration has unique IDs, valid coordinates, and documents within the Firestore size limit', () => {
  for (const [name, records] of Object.entries(catalog)) {
    assert.equal(new Set(records.map(r => r.id)).size, records.length, name);
    for (const record of records) assert.ok(Buffer.byteLength(JSON.stringify(record)) < 1000000, `${name}/${record.id}`);
  }
  for (const d of catalog.destinations) {
    assert.ok(Number.isFinite(d.coordinates.latitude) && Math.abs(d.coordinates.latitude) <= 90, d.id);
    assert.ok(Number.isFinite(d.coordinates.longitude) && Math.abs(d.coordinates.longitude) <= 180, d.id);
  }
});
test('every migrated media reference has a preserved backend asset', () => {
  for (const [, name] of JSON.stringify(catalog).matchAll(/seed-asset:\/\/([^"\\]+)/g)) {
    assert.ok(assets[name], name);
    assert.ok(fs.existsSync(path.join(base, 'seed/assets', name)), name);
  }
});
test('all migration booking inventory has provider links', () => {
  for (const record of [...catalog.offers, ...catalog.packages]) assert.ok(catalog.partners.some(p => p.id === record.partnerId), record.id);
  for (const record of catalog.flights) assert.ok(catalog.partners.some(p => p.id === record.airlineId), record.id);
});

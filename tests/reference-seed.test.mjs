import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { prepareReferences, encodeValue, decodeValue, seedReferences } from '../scripts/seed-references.mjs';

test('all ten reference documents are image-independent and survive REST serialization', async () => {
  const catalog = JSON.parse(await fs.readFile(new URL('../seed/catalog.json', import.meta.url), 'utf8'));
  const records = prepareReferences(catalog);
  assert.equal(records.length, 10);
  assert.ok(records.some(r => r.id === 'partnerReference'));
  assert.deepEqual(decodeValue(encodeValue(records)), records);
  assert.throws(() => prepareReferences({ referenceData: [{ id: 'photos', items: ['seed-asset://a.jpg'] }] }), /unpublished media/);
  assert.throws(() => prepareReferences({ referenceData: [{ id: 'x' }, { id: 'x' }] }), /unique/);
});

test('reference seed creates only referenceData documents and reads them back', async () => {
  const record = { id: 'example', items: [{ name: 'Ella', latitude: 6.8667, count: 2, enabled: true, optional: null }] };
  let stored;
  const methods = [];
  const result = await seedReferences('demo-skyconnect', [record], async (url, options = {}) => {
    assert.match(url, /\/documents\/referenceData[/?]/);
    methods.push(options.method || 'GET');
    if (options.method === 'POST') { stored = JSON.parse(options.body); return stored; }
    return stored;
  });
  assert.deepEqual(methods, ['POST', 'GET']);
  assert.deepEqual(result, [{ id: 'example', status: 'created', verified: true }]);
});

test('reruns preserve existing documents and fail on conflicting reference data', async () => {
  const record = { id: 'existing', items: ['Original'] };
  let actual = record;
  const methods = [];
  const request = async (_, options = {}) => {
    methods.push(options.method || 'GET');
    if (options.method === 'POST') throw Object.assign(new Error('Already exists'), { status: 409 });
    return { fields: encodeValue(actual).mapValue.fields };
  };
  assert.deepEqual(await seedReferences('demo-skyconnect', [record], request), [{ id: 'existing', status: 'preserved', verified: true }]);
  actual = { ...record, items: ['Changed in production'] };
  await assert.rejects(seedReferences('demo-skyconnect', [record], request), /preserved and needs review/);
  assert.deepEqual(methods, ['POST', 'GET', 'POST', 'GET']);
  assert.deepEqual(actual.items, ['Changed in production']);
});

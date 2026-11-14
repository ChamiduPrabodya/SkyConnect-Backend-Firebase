import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mediaPatch, applyMediaPlan, readCatalog } from '../scripts/backfill-cloudinary.mjs';
import { cloudinaryConfig, deleteCloudinaryPartnerPhotos, mediaSignature, mediaOwnerKey, uploadCatalogPhoto } from '../functions/src/cloudinary.mjs';
import { encodeValue } from '../scripts/seed-references.mjs';

const file = '0123456789abcdef01234567.jpg', ref = `seed-asset://${file}`;
const url = 'https://res.cloudinary.com/unit/image/upload/v1/catalog.webp';
const urls = { [file]: url };
test('media-only backfill preserves names, edited prices, status, deleted activities and custom images', () => {
  const seed = { id: 'ella', image: ref, activities: [{ id: 'bridge', image: ref, price: 10 }, { id: 'deleted', image: ref }] };
  const current = { id: 'ella', name: 'My edited place', image: null, price: 99, status: 'Pending',
    activities: [{ id: 'new', name: 'New activity' }, { id: 'bridge', image: null, price: 70 }] };
  const patch = mediaPatch(current, seed, urls);
  assert.deepEqual(Object.keys(patch).sort(), ['activities', 'image']);
  assert.deepEqual(patch.activities, [{ id: 'new', name: 'New activity' }, { id: 'bridge', image: url, price: 70 }]);
  assert.deepEqual(mediaPatch({ ...current, image: 'https://custom/photo', activities: [] }, seed, urls), {});
  assert.deepEqual(mediaPatch({ ...current, ...patch }, seed, urls), {});
});
test('mixed galleries retain custom photos and only replace seed placeholders', () => {
  assert.deepEqual(mediaPatch({ images: ['https://custom/photo', ref] }, { images: [ref] }, urls), { images: ['https://custom/photo', url] });
});
test('live plan skips missing documents instead of creating inventory', async () => {
  const catalog = { flights: [{ id: 'EK 354', image: ref }] };
  const plan = await readCatalog('unit-project', catalog, async () => [{ missing: 'projects/unit-project/databases/(default)/documents/flights/EK 354' }]);
  assert.equal(plan.documents.length, 0);
  assert.deepEqual(plan.missing, ['flights/EK 354']);
  await assert.rejects(readCatalog(undefined, catalog, async () => assert.fail('No project was selected')), /Set a valid/);
});
test('backup completes before atomic masked writes and update-time preconditions reject concurrent edits', async () => {
  const snapshot = { name: 'projects/unit/databases/(default)/documents/destinations/ella', updateTime: '2026-11-14T00:00:00Z',
    fields: encodeValue({ name: 'Edited name', price: 99, image: null }).mapValue.fields };
  const plan = { base: 'https://firestore.googleapis.com/v1/test/documents', documents: [{ snapshot,
    current: { name: 'Edited name', price: 99, image: null }, seed: { image: ref }, path: 'destinations/ella' }] };
  let backedUp = false;
  await assert.rejects(applyMediaPlan(plan, urls, async (target, options) => {
    assert.ok(backedUp);
    const write = JSON.parse(options.body).writes[0];
    assert.deepEqual(write.updateMask.fieldPaths, ['image']);
    assert.deepEqual(write.currentDocument, { updateTime: snapshot.updateTime });
    assert.equal(write.update.fields.name, undefined);
    throw new Error('Concurrent edit');
  }, async rows => { assert.deepEqual(rows, [snapshot]); backedUp = true; }), /Concurrent edit/);
});
test('backup failure prevents every Firestore write', async () => {
  let writes = 0;
  await assert.rejects(applyMediaPlan({ documents: [{ current: { image: null }, seed: { image: ref }, snapshot: {} }] }, urls,
    async () => { writes++; }, async () => { throw new Error('No backup'); }), /No backup/);
  assert.equal(writes, 0);
});
test('successful backfill verifies the whole document, including untouched business data', async () => {
  const current = { name: 'Edited name', price: 99, status: 'Pending', image: null };
  const snapshot = { name: 'projects/unit/databases/(default)/documents/destinations/ella', updateTime: '2026-11-14T00:00:00Z' };
  let committed = false;
  const result = await applyMediaPlan({ base: 'https://example.invalid/documents', documents: [{ current, snapshot, seed: { image: ref } }] }, urls,
    async (target, options) => {
      if (target.endsWith(':commit')) { committed = true; return {}; }
      assert.ok(committed);
      return [{ found: { ...snapshot, fields: encodeValue({ ...current, image: url }).mapValue.fields } }];
    }, async () => {});
  assert.deepEqual(result, { updated: 1, verified: true });
});
test('signature and catalog public IDs are deterministic without transmitting a secret', async () => {
  assert.equal(mediaSignature({ timestamp: '1', public_id: 'test' }, 'secret'), createHash('sha256').update('public_id=test&timestamp=1secret').digest('hex'));
  const config = cloudinaryConfig({ CLOUDINARY_CLOUD_NAME: 'unit', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'private-secret' });
  const result = await uploadCatalogPhoto(Buffer.from('photo'), file, 'image/jpeg', config, async (target, options) => {
    assert.equal(new URL(target).host, 'api.cloudinary.com');
    assert.equal(options.body.get('overwrite'), 'false');
    assert.equal(options.body.get('format'), 'webp');
    assert.equal(options.body.get('allowed_formats'), 'webp');
    assert.equal(options.body.get('api_secret'), null);
    assert.equal(options.body.get('public_id'), `skyconnect/catalog/seed/${file.slice(0, -4)}`);
    return { ok: true, json: async () => ({ public_id: options.body.get('public_id'), resource_type: 'image', format: 'webp', secure_url: url.replace('/catalog.webp', '/seed.webp') }) };
  });
  assert.match(result, /^https:\/\/res.cloudinary.com/);
});
test('idempotent catalog retry reuses an existing supported original without overwriting it', async () => {
  const result = await uploadCatalogPhoto(Buffer.from('photo'), file, 'image/jpeg', { cloud: 'unit', key: 'key', secret: 'secret' }, async (target, options) => {
    assert.equal(options.body.get('overwrite'), 'false');
    return { ok: true, json: async () => ({ public_id: options.body.get('public_id'), resource_type: 'image',
      format: 'jpg', existing: true, secure_url: 'https://res.cloudinary.com/unit/image/upload/v1/photo.jpg' }) };
  });
  assert.match(result, /\.jpg$/);
});
test('account photo deletion is restricted to the owner hash and handles pagination', async () => {
  let calls = 0, renews = 0;
  await deleteCloudinaryPartnerPhotos('owner', async () => { renews++; }, { cloud: 'unit', key: 'key', secret: 'secret' }, async (target, options) => {
    assert.equal(target.searchParams.get('prefix'), `skyconnect/partners/${mediaOwnerKey('owner')}/`);
    assert.notEqual(target.searchParams.get('prefix'), `skyconnect/partners/${mediaOwnerKey('other')}/`);
    assert.equal(options.method, 'DELETE');
    calls++;
    if (calls === 2) assert.equal(target.searchParams.get('next_cursor'), 'next');
    return { ok: true, json: async () => calls === 1 ? { partial: true, next_cursor: 'next', deleted: { photo: 'deleted' } } : { partial: false, deleted: {} } };
  });
  assert.equal(calls, 2); assert.equal(renews, 2);
});

import { createHash } from 'node:crypto';

export const mediaOwnerKey = uid => createHash('sha256').update(uid).digest('hex');
export function cloudinaryConfig(env = process.env) {
  const cloud = env.CLOUDINARY_CLOUD_NAME, key = env.CLOUDINARY_API_KEY, secret = env.CLOUDINARY_API_SECRET;
  if (!/^[A-Za-z0-9_-]+$/.test(cloud || '') || !key || !secret) throw new Error('Cloudinary server credentials are not configured.');
  return { cloud, key, secret };
}
export function mediaSignature(params, secret) {
  const payload = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
  return createHash('sha256').update(payload + secret).digest('hex');
}

export async function uploadCatalogPhoto(bytes, filename, contentType, config, request = fetch) {
  if (!/^[a-f0-9]{24}\.(jpg|jpeg|png|webp)$/.test(filename)) throw new Error('Invalid catalog asset filename.');
  const publicId = `skyconnect/catalog/seed/${filename.replace(/\.[^.]+$/, '')}`;
  const params = { public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)), overwrite: 'false',
    format: 'webp', allowed_formats: 'webp', transformation: 'c_limit,w_1920,h_1920,q_auto' };
  const form = new FormData();
  for (const [key, value] of Object.entries(params)) form.append(key, value);
  form.append('api_key', config.key);
  form.append('signature', mediaSignature(params, config.secret));
  form.append('file', new Blob([bytes], { type: contentType }), filename);
  const response = await request(`https://api.cloudinary.com/v1_1/${config.cloud}/image/upload`, {
    method: 'POST', body: form, signal: AbortSignal.timeout(60000), redirect: 'error',
  });
  if (!response.ok) throw new Error(`Cloudinary upload failed (HTTP ${response.status}); no Firestore fields were changed.`);
  const result = await response.json();
  const url = new URL(result.secure_url || 'https://invalid.example');
  // An idempotent retry may reuse a photo uploaded before WebP normalization.
  const supported = result.format === 'webp' || (result.existing === true && ['jpg', 'jpeg', 'png'].includes(result.format));
  if (result.public_id !== publicId || result.resource_type !== 'image' || !supported
      || url.origin !== 'https://res.cloudinary.com' || !url.pathname.startsWith(`/${config.cloud}/image/upload/`)) {
    throw new Error('Cloudinary returned an unexpected catalog asset.');
  }
  return result.secure_url;
}

export async function deleteCloudinaryPartnerPhotos(uid, renew, config, request = fetch) {
  // Public IDs use a hash of the Firebase UID, not names, emails or card details.
  const prefix = `skyconnect/partners/${mediaOwnerKey(uid)}/`;
  let cursor;
  do {
    await renew();
    const url = new URL(`https://api.cloudinary.com/v1_1/${config.cloud}/resources/image/upload`);
    url.searchParams.set('prefix', prefix); url.searchParams.set('invalidate', 'true');
    if (cursor) url.searchParams.set('next_cursor', cursor);
    const response = await request(url, { method: 'DELETE', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Basic ${Buffer.from(`${config.key}:${config.secret}`).toString('base64')}` } });
    if (!response.ok) throw new Error(`Cloudinary photo deletion failed (HTTP ${response.status}).`);
    const result = await response.json();
    if (!result.deleted || typeof result.deleted !== 'object' || Array.isArray(result.deleted)) throw new Error('Cloudinary did not confirm account photo deletion.');
    if (Object.values(result.deleted || {}).some(status => !['deleted', 'not_found'].includes(status))) throw new Error('Cloudinary could not delete every account photo.');
    cursor = result.partial ? result.next_cursor : null;
    if (result.partial && !cursor) throw new Error('Cloudinary deletion requires a continuation cursor.');
  } while (cursor);
}

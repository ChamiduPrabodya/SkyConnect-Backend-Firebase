import { encodeValue } from '../scripts/seed-references.mjs';

function decode(v) {
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('stringValue' in v) return v.stringValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('bytesValue' in v) return v.bytesValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, value]) => [k, decode(value)]));
  throw new Error('Unknown Firestore field type.');
}
export class NotificationStore {
  constructor(projectId, request) {
    if (!/^[a-z][a-z0-9-]+$/.test(projectId)) throw new Error('Set a valid GOOGLE_CLOUD_PROJECT.');
    this.prefix = `projects/${projectId}/databases/(default)/documents/`;
    this.base = `https://firestore.googleapis.com/v1/${this.prefix.slice(0, -1)}`;
    this.request = request;
  }
  unpack(doc) { return { name: doc.name, path: doc.name.slice(this.prefix.length), updateTime: doc.updateTime, data: decode({ mapValue: { fields: doc.fields || {} } }) }; }
  async get(path) {
    try { return this.unpack(await this.request(`${this.base}/${path.split('/').map(encodeURIComponent).join('/')}`)); }
    catch (error) { if (error.status === 404) return null; throw error; }
  }
  async query(structuredQuery, readTime) {
    const rows = await this.request(`${this.base}:runQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery, ...(readTime ? { readTime } : {}) }) });
    if (!Array.isArray(rows)) throw new Error('Unexpected Firestore query response.');
    return rows.filter(r => r.document).map(r => this.unpack(r.document));
  }
  async devices(uid) {
    const results = [];
    let pageToken;
    do {
      const url = new URL(`${this.base}/users/${encodeURIComponent(uid)}/devices`);
      url.searchParams.set('pageSize', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await this.request(url);
      results.push(...(page.documents || []).map(d => this.unpack(d)));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return results;
  }
  put(path, data, precondition) {
    return { update: { name: this.prefix + path, fields: encodeValue(data).mapValue.fields }, ...(precondition ? { currentDocument: precondition } : {}) };
  }
  remove(path, updateTime) { return { delete: this.prefix + path, currentDocument: { updateTime } }; }
  commit(writes) {
    return this.request(`${this.base}:commit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) });
  }
}

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let cached;

// Use the locally authorized Firebase CLI session. Never print or persist its token.
export async function cliToken() {
  if (cached && cached.expires_at > Date.now() + 60000) return cached.access_token;
  const auth = require('firebase-tools/lib/auth');
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error('Run npx.cmd firebase login first.');
  cached = account.tokens;
  if (!cached.access_token || cached.expires_at <= Date.now() + 60000) {
    cached = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase']);
  }
  return cached.access_token;
}

export const cliCredential = { getAccessToken: async () => ({ access_token: await cliToken(), expires_in: 300 }) };

export async function cloudRequest(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${await cliToken()}`, ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.error || (Array.isArray(body) ? body.find(row => row.error)?.error : null);
    const error = new Error(detail?.message || `Cloud request returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

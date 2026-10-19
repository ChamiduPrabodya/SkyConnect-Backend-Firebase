import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

const localEnv = new URL('../functions/.env.local', import.meta.url);
const original = await readFile(localEnv, 'utf8').catch(error => {
  if (error.code === 'ENOENT') return '';
  throw error;
});
const key = 'NOTIFICATION_ADMIN_UIDS';
const pattern = new RegExp(`^${key}=.*$`, 'm');
const replacement = `${key}=emulator-admin`;
// Firebase's parameter resolver loads .env.local before inherited environment
// values. Override just this public emulator parameter and restore it afterward.
await writeFile(localEnv, pattern.test(original) ? original.replace(pattern, replacement)
  : `${original}${original.endsWith('\n') || !original ? '' : '\n'}${replacement}\n`);

const child = spawn(process.execPath, [
  fileURLToPath(new URL('../node_modules/firebase-tools/lib/bin/firebase.js', import.meta.url)),
  'emulators:exec', '--only', 'auth,firestore,functions', '--project', 'demo-skyconnect',
  'node functions/test/trigger-smoke.mjs',
], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit',
  env: { ...process.env, DEBUG: '', NOTIFICATION_ADMIN_UIDS: 'emulator-admin' } });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', async code => {
  try { await writeFile(localEnv, original); }
  catch (error) { console.error(`Could not restore Functions emulator configuration: ${error.message}`); process.exitCode = 1; return; }
  process.exitCode = code ?? 1;
});

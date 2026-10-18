import { cloudRequest } from './cli-session.mjs';
const [projectId] = process.argv.slice(2);
if (!projectId) throw new Error('Provide a project ID.');
const jobs = {
  billing: () => cloudRequest(`https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`),
  firebaseStorage: () => cloudRequest(`https://firebasestorage.googleapis.com/v1beta/projects/${projectId}/buckets`),
  currentRules: () => cloudRequest(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`),
  appConfig: async () => {
    const { apps = [] } = await cloudRequest(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`);
    if (apps.length !== 1) throw new Error('Expected one web app; compare configurations manually.');
    const config = await cloudRequest(`https://firebase.googleapis.com/v1beta1/${apps[0].name}/config`);
    // Client config is public, but print only a comparison summary.
    const fs = await import('node:fs/promises');
    const fields = { API_KEY:'apiKey', AUTH_DOMAIN:'authDomain', PROJECT_ID:'projectId', STORAGE_BUCKET:'storageBucket', MESSAGING_SENDER_ID:'messagingSenderId', APP_ID:'appId' };
    const clients = {};
    for (const [name, file, prefix] of [
      ['admin', '../../skyconnect-admin-web/.env', 'VITE_FIREBASE_'],
      ['partner', '../../SkyConnect-partner-app-feature-airline-part/.env', 'EXPO_PUBLIC_FIREBASE_'],
      ['traveler', '../../skyconnect user app/SkyConnect-user-app/.env', 'EXPO_PUBLIC_FIREBASE_'],
    ]) {
      const contents = await fs.readFile(new URL(file, import.meta.url), 'utf8');
      const env = Object.fromEntries(contents.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
        const at = line.indexOf('=');
        return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^(['"])(.*)\1$/, '$2')];
      }));
      clients[name] = Object.fromEntries(Object.entries(fields).map(([suffix, key]) => [key, env[prefix + suffix] === config[key]]));
    }
    return { projectId:config.projectId, storageBucket:config.storageBucket, appId:config.appId, clients };
  },
};
await Promise.all(Object.entries(jobs).map(async ([check, job]) => {
  try { const result = await job(); console.log(JSON.stringify({check,ok:true,result:check === 'billing' ? {billingEnabled:result.billingEnabled} : result})); }
  catch(error) { console.log(JSON.stringify({check,ok:false,status:error.status,message:error.message})); }
}));

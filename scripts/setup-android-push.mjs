import fs from 'node:fs/promises';
import { cloudRequest } from './cli-session.mjs';
const projectId = process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) throw new Error('Set GOOGLE_CLOUD_PROJECT.');
const api = 'https://firebase.googleapis.com/v1beta1/';
const targets = [
  { folder:'../../SkyConnect-partner-app-feature-airline-part/', packageName:'com.skyconnect.airline.partner', displayName:'SkyConnect Partner Android' },
  { folder:'../../skyconnect user app/SkyConnect-user-app/', packageName:'com.skyconnectsl.demo', displayName:'SkyConnect Traveler Android' },
];
let { apps = [] } = await cloudRequest(`${api}projects/${projectId}/androidApps`);
for (const target of targets) {
  const directory = new URL(target.folder, import.meta.url);
  const file = new URL('google-services.json', directory);
  let existing;
  try { existing = JSON.parse(await fs.readFile(file,'utf8')); } catch(error) { if(error.code !== 'ENOENT') throw error; }
  if (existing && (existing.project_info?.project_id !== projectId || !existing.client?.some(c=>c.client_info?.android_client_info?.package_name === target.packageName))) throw new Error(`Existing Android configuration does not match ${target.packageName}; preserved.`);
  let app = apps.find(a=>a.packageName === target.packageName);
  if (!app) {
    const operation = await cloudRequest(`${api}projects/${projectId}/androidApps`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({packageName:target.packageName,displayName:target.displayName}) });
    let result = operation;
    while (!result.done) {
      await new Promise(resolve=>setTimeout(resolve,1000));
      result = await cloudRequest(api + operation.name);
    }
    if (result.error) throw new Error(result.error.message);
    app = result.response;
    apps.push(app);
  }
  const config = await cloudRequest(`${api}${app.name}/config`);
  const contents = Buffer.from(config.configFileContents,'base64').toString('utf8');
  const parsed = JSON.parse(contents);
  if (parsed.project_info?.project_id !== projectId || !parsed.client?.some(c=>c.client_info?.android_client_info?.package_name === target.packageName)) throw new Error('Downloaded Android configuration mismatch.');
  if (!existing) await fs.writeFile(file,contents,{flag:'wx'});
  console.log(JSON.stringify({packageName:target.packageName,projectId,config:existing?'preserved':'created'}));
}

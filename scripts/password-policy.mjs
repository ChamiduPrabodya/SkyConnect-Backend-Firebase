import { cloudRequest } from './cli-session.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const project=process.env.GOOGLE_CLOUD_PROJECT;
if(!project || !/^[a-z][a-z0-9-]+$/.test(project)) throw new Error('Set GOOGLE_CLOUD_PROJECT explicitly.');
const passwordPolicyConfig={passwordPolicyEnforcementState:'ENFORCE',forceUpgradeOnSignin:false,passwordPolicyVersions:[{customStrengthOptions:{minPasswordLength:8,containsUppercaseCharacter:true,containsLowercaseCharacter:true,containsNumericCharacter:true,containsNonAlphanumericCharacter:false}}]};
if(!process.argv.includes('--apply')) console.log(JSON.stringify({project,apply:false,passwordPolicyConfig},null,2));
else {
 const url=`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
 const previous=await cloudRequest(url);
 const backup=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../.skyconnect-local',`password-policy-${Date.now()}.json`);
 await fs.mkdir(path.dirname(backup),{recursive:true});await fs.writeFile(backup,JSON.stringify({project,passwordPolicyConfig:previous.passwordPolicyConfig || null},null,2));
 await cloudRequest(`${url}?updateMask=passwordPolicyConfig`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({passwordPolicyConfig})});
 console.log(JSON.stringify({project,applied:true,existingSignInsForcedToUpgrade:false,backup}));
}

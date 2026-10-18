import { cloudRequest } from './cli-session.mjs';
const projectId=process.env.GOOGLE_CLOUD_PROJECT;
if(!projectId)throw new Error('Set GOOGLE_CLOUD_PROJECT.');
const project=await cloudRequest(`https://firebase.googleapis.com/v1beta1/projects/${projectId}`);
for(const service of ['fcm.googleapis.com','fcmregistrations.googleapis.com','firebaseinstallations.googleapis.com']){
  const url=`https://serviceusage.googleapis.com/v1/projects/${project.projectNumber}/services/${service}`;
  let current=await cloudRequest(url);
  if(current.state!=='ENABLED'&&process.argv.includes('--apply')){
    const operation=await cloudRequest(url+':enable',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    let result=operation;
    while(!result.done){await new Promise(resolve=>setTimeout(resolve,1000));result=await cloudRequest('https://serviceusage.googleapis.com/v1/'+operation.name);}
    if(result.error)throw new Error(result.error.message);
    current=await cloudRequest(url);
  }
  console.log(JSON.stringify({service,state:current.state}));
}

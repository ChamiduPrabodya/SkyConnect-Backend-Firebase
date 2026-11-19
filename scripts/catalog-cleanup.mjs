import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { NotificationStore } from '../functions/src/rest-store.mjs';
import { cloudRequest } from './cli-session.mjs';

// Preview first. Never delete records or modify historical booking snapshots.
export function catalogChanges(rows, verifiedPlaces = []) {
  const partners = new Map(rows.filter(row=>row.path.startsWith('partners/')).map(row=>[row.path.split('/')[1],row.data]));
  return rows.filter(row=>!row.path.startsWith('partners/')).map(row=>{
    const table=row.path.split('/')[0], data=row.data;
    const guide=table==='destinations' && verifiedPlaces.find(place=>place.id===row.path.split('/')[1]);
    if(guide && (data.isSample || data.verifiedPublic !== true)) return {path:row.path,updateTime:row.updateTime,action:'verified-public-place',patch:guide};
    if (data.isSample || data.isDemo) return {path:row.path,updateTime:row.updateTime,action:'archive-sample',patch:{status:'Archived',catalogEligible:false}};
    if (['flights','packages'].includes(table)) return {path:row.path,updateTime:row.updateTime,action:'legacy-review',patch:{catalogEligible:false}};
    if (table==='destinations') {
      const verified=data.verifiedPublic===true && /^https:\/\//.test(data.sourceUrl || '') && Number.isFinite(data.coordinates?.latitude) && Number.isFinite(data.coordinates?.longitude);
      return {path:row.path,updateTime:row.updateTime,action:verified?'verified-public-place':'needs-source-verification',patch:{isSample:false,catalogEligible:verified}};
    }
    const partner=partners.get(data.partnerId || data.airlineId);
    const providerReady=partner?.status==='Approved'&&!partner.isSample&&partner.type===(table==='routes'?'Airline':'Tourism');
    const positive=value=>Number.isFinite(value)&&value>0;
    const complete=table==='routes'
      ? /^[A-Z0-9]{2,3}[ -]?\d{1,4}[A-Z]?$/.test(data.flightNo || '') && /^[A-Z]{3}$/.test(data.origin?.code || '') && /^[A-Z]{3}$/.test(data.destination?.code || '') && data.origin.code!==data.destination.code && data.aircraft && /^\d{4}-\d{2}-\d{2}$/.test(data.startDate || '') && /^([01]\d|2[0-3]):[0-5]\d/.test(data.departureTime || '') && /^([01]\d|2[0-3]):[0-5]\d/.test(data.arrivalTime || '') && ['economy','business','first'].some(key=>positive(data.price?.[key])&&positive(data.seats?.[key])&&Number.isInteger(data.seats[key]))
      : String(data.title || data.name || '').trim() && positive(data.priceUSD) && Number.isFinite(data.coordinates?.latitude) && Number.isFinite(data.coordinates?.longitude) && Math.abs(data.coordinates.latitude)<=90 && Math.abs(data.coordinates.longitude)<=180 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '') && /^\+\d{7,15}$/.test(data.phone || '') && (!['stay','hotel'].includes(data.type) || [data.totalRooms,data.maxGuests].every(value=>positive(value)&&Number.isInteger(value)));
    const eligible=Boolean(providerReady&&complete&&data.status===(table==='routes'?'approved':'Published'));
    return {path:row.path,updateTime:row.updateTime,action:eligible?'preserve-reviewed-listing':providerReady?'real-listing-review':'partner-review',patch:{isSample:false,catalogEligible:eligible}};
  });
}

async function main() {
  const project=process.env.GOOGLE_CLOUD_PROJECT;
  if (!project || !/^[a-z][a-z0-9-]+$/.test(project)) throw new Error('Set GOOGLE_CLOUD_PROJECT explicitly.');
  const apply=process.argv.includes('--apply'), reportArg=process.argv.find(arg=>arg.startsWith('--report='));
  const store=new NotificationStore(project,cloudRequest);
  if (apply) {
    if (!reportArg) throw new Error('Run a preview first, then pass --apply --report=<preview/report.json>.');
    const reportPath=path.resolve(reportArg.slice(9)),report=JSON.parse(await fs.readFile(reportPath,'utf8'));
    if(report.project!==project || report.applied) throw new Error('Choose an unapplied preview for this project.');
    if(await fs.stat(path.join(path.dirname(reportPath),'applied.json')).then(()=>true,()=>false)) throw new Error('This preview has already been applied. Create a new preview.');
    const backupPath=path.join(path.dirname(reportPath),'originals.json');
    if(createHash('sha256').update(await fs.readFile(backupPath)).digest('hex')!==report.backupSHA256) throw new Error('The preview backup could not be verified.');
    if(!report.changes.some(change=>change.action==='verified-public-place')) throw new Error('Verify and publish replacement public guides before archiving sample destinations. The current catalog was kept.');
    // Every write is conditional on the exact preview version. Changed data is never overwritten.
    for (const change of report.changes) {
      const current=await store.get(change.path);
      if(!current || current.updateTime!==change.updateTime) throw new Error('Catalog changed since preview. Create a fresh preview.');
    }
    // Commit together so partial archiving cannot remove public guides unexpectedly.
    if(report.changes.length>450) throw new Error('Too many records for one safe migration. Review in smaller batches.');
    await store.commit(report.changes.map(change=>({ ...store.put(change.path,change.patch,{updateTime:change.updateTime}),updateMask:{fieldPaths:Object.keys(change.patch)} })));
    await fs.writeFile(path.join(path.dirname(reportPath),'applied.json'),JSON.stringify({project,appliedAt:new Date().toISOString(),count:report.changes.length},null,2));
    console.log(JSON.stringify({applied:true,records:report.changes.length,bookingsChanged:0})); return;
  }
  const rows=[];
  for(const table of ['partners','offers','routes','destinations','packages','flights']) rows.push(...await store.query({from:[{collectionId:table}]}));
  const output=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../.skyconnect-local',`catalog-review-${Date.now()}`);
  await fs.mkdir(output,{recursive:true});
  const backup=JSON.stringify(rows,null,2);
  await fs.writeFile(path.join(output,'originals.json'),backup);
  const verifiedPlaces=JSON.parse(await fs.readFile(new URL('../seed/verified-public-places.json',import.meta.url),'utf8'));
  const report={project,createdAt:new Date().toISOString(),applied:false,backupSHA256:createHash('sha256').update(backup).digest('hex'),changes:catalogChanges(rows,verifiedPlaces)};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({preview:true,report:path.join(output,'report.json'),counts:Object.fromEntries([...new Set(report.changes.map(row=>row.action))].map(action=>[action,report.changes.filter(row=>row.action===action).length])),bookingsChanged:0}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error=>{console.error(`Catalog review failed (${error.status || 'local'}). No credentials were printed. ${error.status ? 'Check your project access and connection.' : error.message}`);process.exitCode=1;});

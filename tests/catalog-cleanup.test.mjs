import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogChanges} from '../scripts/catalog-cleanup.mjs';
test('cleanup archives samples without deleting or modifying historical bookings',()=>{
 const rows=[{path:'partners/p',data:{status:'Approved',type:'Tourism'}},{path:'destinations/sample',updateTime:'v1',data:{isSample:true,status:'Published'}},{path:'offers/real',updateTime:'v2',data:{partnerId:'p',status:'Published',title:'Real',priceUSD:10}}];
 const changes=catalogChanges(rows);assert.equal(changes.length,2);assert.equal(changes[0].action,'archive-sample');assert.deepEqual(changes[0].patch,{status:'Archived',catalogEligible:false});assert.equal(changes[1].action,'real-listing-review');assert.ok(changes.every(row=>!row.path.startsWith('bookings/')));assert.equal(rows[1].data.status,'Published');
});
test('verified public guides replace sample details without retaining invented paid activities',()=>{
 const guide={id:'galle',verifiedPublic:true,sourceUrl:'https://whc.unesco.org/en/list/451',activities:[],isSample:false,catalogEligible:true,status:'Published'};
 const changes=catalogChanges([{path:'destinations/galle',updateTime:'version',data:{isSample:true,activities:[{price:99}]}}],[guide]);
 assert.equal(changes[0].action,'verified-public-place');assert.equal(changes[0].patch.isSample,false);assert.equal(changes[0].patch.activities.length,0);assert.equal(changes[0].updateTime,'version');
});

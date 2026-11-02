import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
const dir=await mkdtemp(path.join(os.tmpdir(),'whiskay-energy-notice-'));process.env.WHISKAY_DATA_DIR=dir;
const {default:energyWorker}=await import('../src/middlewares/energy-worker.js');
test('merge mode appends one plain-text energy footer after command completion',async()=>{
 const sent=[];const ctx={command:'weather',args:['Medan'],sender:'user@s.whatsapp.net',chat:'group@g.us',prefix:'.',plugin:{workload:'network',cooldown:1000},isBot:false,
 reply:async value=>{sent.push({type:'reply',value});return true;},send:async value=>{sent.push({type:'send',value});return true;},sendInteractive:async payload=>{sent.push({type:'interactive',payload});return true;}};
 await energyWorker(ctx,async()=>true);
 await ctx.reply('Weather result payload');
 await ctx.completeEnergyTelemetry({durationMs:1234,ok:true});
 const merged=sent.filter(x=>x.type==='reply');assert.equal(merged.length,1);
 assert.match(merged[0].value,/baterai digunakan/);assert.match(merged[0].value,/95,00%|tersisa/);
 assert.equal(sent.filter(x=>x.type==='interactive').length,0);
});
test('cleanup',async()=>{for(let i=0;i<5;i++){try{await rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:20});break;}catch(error){if(i===4)throw error;await new Promise(r=>setTimeout(r,30));}}});

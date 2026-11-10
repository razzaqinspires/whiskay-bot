import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
const dir=await mkdtemp(path.join(os.tmpdir(),'whiskay-energy-actions-'));process.env.WHISKAY_DATA_DIR=dir;
const actions=await import('../src/lib/energy-saver-actions.js');
test('energy saver button owner can use token; other user warned once then permanently blocked',async()=>{
 const token=await actions.createEnergySaverAction('owner@s.whatsapp.net');
 assert.equal((await actions.authorizeEnergySaverAction(token,'owner@s.whatsapp.net')).ok,true);
 const first=await actions.authorizeEnergySaverAction(token,'intruder@s.whatsapp.net');assert.equal(first.reason,'warning');
 const second=await actions.authorizeEnergySaverAction(token,'intruder@s.whatsapp.net');assert.equal(second.reason,'blocked');
 const future=await actions.authorizeEnergySaverAction(token,'intruder@s.whatsapp.net');assert.equal(future.reason,'blocked');
 assert.equal((await actions.getEnergySaverActionSecurity('intruder@s.whatsapp.net')).blocked,true);
});
test('expired or unknown tokens are rejected',async()=>{
 const result=await actions.authorizeEnergySaverAction('unknown','another@s.whatsapp.net');assert.equal(result.reason,'expired');
});
test('cleanup',async()=>{await rm(dir,{recursive:true,force:true});});

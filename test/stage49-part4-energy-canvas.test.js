import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
const dir=await mkdtemp(path.join(os.tmpdir(),'whiskay-stage49-p4-canvas-'));process.env.WHISKAY_DATA_DIR=dir;
const {renderEnergyNotificationCanvas}=await import('../src/services/canvas-v2.js');
test('Energy Canvas V1 returns a PNG with bounded telemetry inputs',async()=>{
 const png=await renderEnergyNotificationCanvas({used:0.89,remaining:95.99,xp:4,level:2,workload:'dynamic',runtimeMs:493,payloadKB:1.05});
 assert.ok(Buffer.isBuffer(png));assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
});
test('cleanup',async()=>{await rm(dir,{recursive:true,force:true});});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const dir=await mkdtemp(path.join(os.tmpdir(),'whiskay-stage49-p4-'));
process.env.WHISKAY_DATA_DIR=dir;
const settings=await import('../src/lib/menu-settings.js');
const leveling=await import('../src/lib/leveling.js');

test('new user inherits global defaults while existing user preferences are preserved',async()=>{
 await settings.updateMenuSettings('old-user',{batteryNotification:'card',xpNotificationEnabled:false});
 await settings.setGlobalMenuDefaults({...settings.defaultMenuSettings(),batteryNotification:'separate',xpNotificationEnabled:true},'owner');
 const old=await settings.getMenuSettings('old-user');
 const fresh=await settings.getMenuSettings('new-user');
 assert.equal(old.batteryNotification,'card');assert.equal(old.xpNotificationEnabled,false);
 assert.equal(fresh.batteryNotification,'separate');assert.equal(fresh.xpNotificationEnabled,true);
});
test('command XP is recorded in the existing leveling ledger with duplicate cooldown',async()=>{
 const first=await leveling.awardCommandXP('chat@g.us','user@s.whatsapp.net','weather',1000000);
 assert.ok(first.gain>=2&&first.gain<=6);
 const second=await leveling.awardCommandXP('chat@g.us','user@s.whatsapp.net','weather',1005000);
 assert.equal(second.cooldown,true);assert.equal(second.gain,0);
 const status=await leveling.getLevelingStorageStatus();
 assert.equal(status.users,1);assert.equal(status.schemaVersion,3);assert.ok(status.xpTotal>=first.gain);
 const raw=JSON.parse(await readFile(path.join(dir,'leveling.json'),'utf8'));
 assert.ok(raw.users['chat@g.us|user@s.whatsapp.net']);assert.equal(raw.schemaVersion,3);
});
test('Bio Core exposes deterministic local telemetry policy without provider dependency',async()=>{
 const {getBioCoreSnapshot}=await import('../src/core/BioCore.js');
 const snap=getBioCoreSnapshot();assert.equal(snap.externalProviderRequired,false);assert.ok(['normal','balanced','conserve','protect'].includes(snap.state));
});
test('cleanup',async()=>{await rm(dir,{recursive:true,force:true});});

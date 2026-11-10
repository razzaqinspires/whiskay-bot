import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const moduleUrl = new URL('../src/lib/leveling.js', import.meta.url).href;
const temp = await mkdtemp(path.join(os.tmpdir(), 'whiskay-stage70-leveling-'));
const env = { ...process.env, WHISKAY_DATA_DIR: temp };
function run(code, extra={}) {
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:process.cwd(),encoding:'utf8',env:{...env,...extra},timeout:30000});
  assert.equal(result.status,0,`${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

test('LID and PN resolve to the same existing profile and alias persists across restart', async () => {
  try {
    run(`const m=await import(${JSON.stringify(moduleUrl)}); await m.updateProfile('120@g.us','12345@lid',{xp:91,level:4,coin:500,points:17}); await m.registerLevelingIdentityAlias('12345@lid','6281234567890@s.whatsapp.net'); await m.awardCommandXP('120@g.us','12345@lid','identity-test');`);
    const result=JSON.parse(run(`const m=await import(${JSON.stringify(moduleUrl)}); const a=await m.getProfile('120@g.us','6281234567890@s.whatsapp.net'); const b=await m.getProfile('120@g.us','12345@lid'); const board=await m.getLeaderboard('120@g.us'); const s=await m.getLevelingStorageStatus(); console.log(JSON.stringify({a,b,board,s}));`));
    assert.ok(result.a.xp>91); assert.equal(result.a.level,4); assert.equal(result.a.coin,500);
    assert.equal(result.b.xp,result.a.xp); assert.equal(result.board.length,1); assert.equal(result.board[0].user,'6281234567890@s.whatsapp.net'); assert.equal(result.board[0].rank,'Rookie'); assert.equal(result.s.identityAliases,1);
  } finally { await rm(temp,{recursive:true,force:true}); }
});

test('alias migration merges split profiles without adding duplicate XP or currency', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'whiskay-stage70-merge-'));
  try {
    const e={...env,WHISKAY_DATA_DIR:dir};
    const first=spawnSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(moduleUrl)}); await m.updateProfile('g@g.us','628123@s.whatsapp.net',{xp:15,level:2,coin:100,points:4}); await m.updateProfile('g@g.us','999@lid',{xp:45,level:4,coin:250,points:9}); await m.registerLevelingIdentityAlias('999@lid','628123@s.whatsapp.net');`],{cwd:process.cwd(),encoding:'utf8',env:e});
    assert.equal(first.status,0,first.stderr);
    const output=spawnSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(moduleUrl)}); const p=await m.getProfile('g@g.us','628123@s.whatsapp.net'); const d=JSON.parse(await (await import('node:fs/promises')).readFile(${JSON.stringify(path.join(dir,'leveling.json'))},'utf8')); console.log(JSON.stringify({p,keys:Object.keys(d.users)}));`],{cwd:process.cwd(),encoding:'utf8',env:e});
    assert.equal(output.status,0,output.stderr);
    const data=JSON.parse(output.stdout.trim());
    assert.equal(data.p.level,4); assert.equal(data.p.xp,45); assert.equal(data.p.coin,250); assert.equal(data.p.points,9);
    assert.deepEqual(data.keys,['g@g.us|628123@s.whatsapp.net']);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('direct-chat scope and user identity both canonicalize from LID to PN', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'whiskay-stage70-dm-'));
  try {
    const e={...env,WHISKAY_DATA_DIR:dir};
    const r=spawnSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(moduleUrl)}); await m.updateProfile('777@lid','777@lid',{xp:66,level:3}); await m.registerLevelingIdentityAlias('777@lid','628777@s.whatsapp.net'); const p=await m.getProfile('628777@s.whatsapp.net','628777@s.whatsapp.net'); if(p.xp!==66||p.level!==3)process.exit(4);`],{cwd:process.cwd(),encoding:'utf8',env:e});
    assert.equal(r.status,0,r.stderr);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('conflicting LID mapping is rejected and existing mapping is preserved', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'whiskay-stage70-conflict-'));
  try {
    const e={...env,WHISKAY_DATA_DIR:dir};
    const r=spawnSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(moduleUrl)}); await m.registerLevelingIdentityAlias('55@lid','628111@s.whatsapp.net'); const result=await m.registerLevelingIdentityAlias('55@lid','628222@s.whatsapp.net'); const p=await m.getProfile('g@g.us','55@lid'); console.log(JSON.stringify({result,p}));`],{cwd:process.cwd(),encoding:'utf8',env:e});
    assert.equal(r.status,0,r.stderr); const data=JSON.parse(r.stdout.trim());
    assert.equal(data.result.reason,'conflict');
    const db=JSON.parse(await readFile(path.join(dir,'leveling.json'),'utf8'));
    assert.equal(db.identities.lidToPn['55@lid'],'628111@s.whatsapp.net');
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('legacy schema without identities remains readable and upgrades on next mutation', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'whiskay-stage70-legacy-'));
  try {
    await writeFile(path.join(dir,'leveling.json'),JSON.stringify({schemaVersion:3,groups:{'g@g.us':true},users:{'g@g.us|6281@s.whatsapp.net':{xp:22,level:2}},quizStats:{},audit:[]}));
    const e={...env,WHISKAY_DATA_DIR:dir};
    const r=spawnSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(moduleUrl)}); const before=await m.getProfile('g@g.us','6281@s.whatsapp.net'); await m.registerLevelingIdentityAlias('1@lid','6281@s.whatsapp.net'); const db=JSON.parse(await (await import('node:fs/promises')).readFile(${JSON.stringify(path.join(dir,'leveling.json'))},'utf8')); if(before.xp!==22||db.schemaVersion!==4||!db.identities.lidToPn['1@lid'])process.exit(5);`],{cwd:process.cwd(),encoding:'utf8',env:e});
    assert.equal(r.status,0,r.stderr);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

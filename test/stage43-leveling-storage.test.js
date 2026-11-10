import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const project = path.resolve('.');
const moduleUrl = new URL('../src/lib/leveling.js', import.meta.url).href;
async function runNode(root, code, extra = {}) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: project, encoding: 'utf8', env: { ...process.env, WHISKAY_DATA_DIR: root, ...extra }
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

test('leveling profile survives process restart and keeps XP/level', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-leveling-'));
  try {
    await runNode(root, `const m=await import(${JSON.stringify(moduleUrl)}); await m.setGroupLeveling('group@g.us',true,'owner'); await m.updateProfile('group@g.us','user@s.whatsapp.net',{xp:87,level:4,coin:1250});`);
    const output = await runNode(root, `const m=await import(${JSON.stringify(moduleUrl)}); const p=await m.getProfile('group@g.us','user@s.whatsapp.net'); if(p.xp!==87||p.level!==4||p.coin!==1250)process.exit(3); console.log(JSON.stringify(p));`);
    const profile = JSON.parse(output);
    assert.equal(profile.xp, 87); assert.equal(profile.level, 4); assert.equal(profile.coin, 1250);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('corrupt primary recovers last valid backup without resetting profile', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-leveling-backup-'));
  try {
    await runNode(root, `const m=await import(${JSON.stringify(moduleUrl)}); await m.updateProfile('g','u',{xp:31,level:2}); await m.updateProfile('g','u',{xp:49,level:3}); const s=await m.getLevelingStorageStatus(); if(s.primaryStatus!=='VALID'||s.backupStatus!=='VALID')process.exit(5);`);
    await writeFile(path.join(root, 'leveling.json'), '{broken');
    const output = await runNode(root, `const m=await import(${JSON.stringify(moduleUrl)}); const p=await m.getProfile('g','u'); console.log(JSON.stringify(p));`);
    const p = JSON.parse(output);
    assert.equal(p.xp, 31); assert.equal(p.level, 2);
    assert.ok((await readdir(root)).some(n => n.startsWith('leveling.json.corrupt-')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('1GB archive policy can be exercised with a test threshold and archive is recoverable', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-leveling-archive-'));
  try {
    await runNode(root, `const m=await import(${JSON.stringify(moduleUrl)}); await m.updateProfile('g','u',{xp:12,level:1,note:'x'.repeat(1_100_000)});` , { WHISKAY_DB_ARCHIVE_BYTES: '1048576' });
    const archiveDir = path.join(root, 'archives', 'leveling');
    const archives = (await readdir(archiveDir)).filter(n => n.endsWith('.json.gz'));
    assert.equal(archives.length, 1);
    const status = await runNode(root, `const m=await import(${JSON.stringify(moduleUrl)}); console.log(JSON.stringify(await m.getLevelingStorageStatus()));`, { WHISKAY_DB_ARCHIVE_BYTES: '1048576' });
    assert.equal(JSON.parse(status).archiveCount, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('when primary and backup are damaged, verified archive restores the requested profile', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-leveling-archive-restore-'));
  try {
    await runNode(root, `const m=await import(${JSON.stringify(moduleUrl)}); await m.updateProfile('guild','archived-user',{xp:77,level:5,note:'z'.repeat(1_100_000)});`, { WHISKAY_DB_ARCHIVE_BYTES: '1048576' });
    await writeFile(path.join(root, 'leveling.json'), 'broken-primary');
    await writeFile(path.join(root, 'leveling.json.bak'), 'broken-backup');
    const output = await runNode(root, `const m=await import(${JSON.stringify(moduleUrl)}); const p=await m.getProfile('guild','archived-user'); console.log(JSON.stringify({xp:p.xp,level:p.level}));`, { WHISKAY_DB_ARCHIVE_BYTES: '1048576' });
    const p = JSON.parse(output);
    assert.equal(p.xp, 77); assert.equal(p.level, 5);
    assert.ok((await readdir(root)).some(n => n.startsWith('leveling.json.corrupt-')));
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('backup write failure aborts save and never moves or overwrites a valid primary', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-leveling-backup-write-failure-'));
  try {
    await runNode(root, `
      const m=await import(${JSON.stringify(moduleUrl)});
      await m.updateProfile('g','u',{xp:31,level:2,coin:50});
      await (await import('node:fs/promises')).mkdir(${JSON.stringify(path.join(root, 'leveling.json.bak'))});
      let rejected=false;
      try { await m.updateProfile('g','u',{xp:49,level:3,coin:75}); }
      catch { rejected=true; }
      const p=await m.getProfile('g','u');
      if(!rejected||p.xp!==31||p.level!==2||p.coin!==50)process.exit(4);
      console.log(JSON.stringify({rejected, xp:p.xp, level:p.level, coin:p.coin}));
    `);
    const primary = JSON.parse(await readFile(path.join(root, 'leveling.json'), 'utf8'));
    assert.equal(primary.users['g|u'].xp, 31);
    assert.equal(primary.users['g|u'].level, 2);
    assert.equal(primary.users['g|u'].coin, 50);
    assert.ok(!(await readdir(root)).some(name => name.startsWith('leveling.json.corrupt-')));
    assert.ok(!(await readdir(root)).some(name => name.endsWith('.tmp')));
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('manual backup restore quarantines a corrupt primary before restoring', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-leveling-manual-restore-'));
  try {
    await runNode(root, `
      const m=await import(${JSON.stringify(moduleUrl)});
      await m.updateProfile('g','u',{xp:31,level:2});
      await m.updateProfile('g','u',{xp:49,level:3});
      await (await import('node:fs/promises')).writeFile(${JSON.stringify(path.join(root, 'leveling.json'))}, '{broken-primary');
      const result=await m.restoreLevelingFromBackup();
      const profile=await m.getProfile('g','u');
      if(!result.restored||profile.xp!==31||profile.level!==2)process.exit(6);
      console.log(JSON.stringify({restored:result.restored,xp:profile.xp,level:profile.level}));
    `);
    const active = JSON.parse(await readFile(path.join(root, 'leveling.json'), 'utf8'));
    assert.equal(active.users['g|u'].xp, 31);
    assert.ok((await readdir(root)).some(name => name.startsWith('leveling.json.corrupt-')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

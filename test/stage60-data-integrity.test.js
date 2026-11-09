import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { buildPluginRegistry } from '../src/core/PluginRegistry.js';

const execFileAsync = promisify(execFile);
const root = path.resolve(new URL('..', import.meta.url).pathname);
const ENERGY_MODULE = new URL('../src/lib/energy-worker.js', import.meta.url).href;
const WEBHOOK_MODULE = new URL('../src/services/webhookRuntime.js', import.meta.url).href;
const runNode = (dataDir, code) => execFileAsync(process.execPath, ['--input-type=module', '-e', code], {
  cwd: root,
  env: { ...process.env, WHISKAY_DATA_DIR: dataDir, NODE_ENV: 'test' },
  timeout: 30000,
  maxBuffer: 2 * 1024 * 1024,
});
const tempDir = async prefix => mkdtemp(path.join(os.tmpdir(), prefix));

 test('energy ledger corruption fails closed and never overwrites the damaged bytes', async () => {
  const dir = await tempDir('whiskay-energy-corrupt-');
  try {
    const file = path.join(dir, 'energy-ledger.json');
    const corrupt = '{ "player": { "energy": 12 }';
    await writeFile(file, corrupt);
    const code = `import { consumeEnergy } from '${ENERGY_MODULE}'; try { await consumeEnergy('player','menu',1); process.exitCode=2; } catch (e) { if (e.code !== 'WHISKAY_DATA_CORRUPT') throw e; console.log('CORRUPTION_BLOCKED'); }`;
    const result = await runNode(dir, code);
    assert.match(result.stdout, /CORRUPTION_BLOCKED/);
    assert.equal(await readFile(file, 'utf8'), corrupt);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test('fresh installation reports missing Energy primary and backup without a corruption alarm', async () => {
  const dir = await tempDir('whiskay-energy-fresh-status-');
  try {
    const code = `import { inspectEnergyLedger } from '${ENERGY_MODULE}'; const s=await inspectEnergyLedger(); if(s.primary.reason!=='missing'||s.backup.reason!=='missing'||s.recoveryAvailable) throw new Error(JSON.stringify(s)); console.log('FRESH_LEDGER_OK');`;
    const result = await runNode(dir, code);
    assert.match(result.stdout, /FRESH_LEDGER_OK/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('energy writes preserve a valid previous ledger as an atomic backup', async () => {
  const dir = await tempDir('whiskay-energy-backup-');
  try {
    const file = path.join(dir, 'energy-ledger.json');
    await mkdir(dir, { recursive: true });
    await writeFile(file, JSON.stringify({ player: { energy: 40, commands: 0, totalSpent: 0 } }));
    await runNode(dir, `import { consumeEnergy } from '${ENERGY_MODULE}'; const r=await consumeEnergy('player','menu',2); if(!r.ok) throw new Error('debit failed');`);
    const primary = JSON.parse(await readFile(file, 'utf8'));
    const backup = JSON.parse(await readFile(`${file}.bak`, 'utf8'));
    assert.equal(primary.player.energy, 38);
    assert.equal(backup.player.energy, 40);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test('explicit energy backup recovery preserves the damaged primary before restoring', async () => {
  const dir = await tempDir('whiskay-energy-restore-');
  try {
    const file = path.join(dir, 'energy-ledger.json');
    await writeFile(`${file}.bak`, JSON.stringify({ player: { energy: 55, commands: 4, totalSpent: 6 } }));
    const damaged = '{corrupt primary';
    await writeFile(file, damaged);
    const code = `import { restoreEnergyLedgerBackup } from '${ENERGY_MODULE}'; const r=await restoreEnergyLedgerBackup({confirm:true}); if(!r.ok) throw new Error(JSON.stringify(r));`;
    await runNode(dir, code);
    const restored = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(restored.player.energy, 55);
    const names = await readdir(dir);
    const archive = names.find(name => name.startsWith('energy-ledger.json.pre-restore-'));
    assert.ok(archive, 'damaged primary must remain available for forensic inspection');
    assert.equal(await readFile(path.join(dir, archive), 'utf8'), damaged);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('concurrent processes cannot lose energy ledger updates', async () => {
  const dir = await tempDir('whiskay-energy-multi-');
  try {
    const file = path.join(dir, 'energy-ledger.json');
    await writeFile(file, JSON.stringify({ player: { energy: 30, commands: 0, totalSpent: 0 } }));
    const code = `import { consumeEnergy } from '${ENERGY_MODULE}'; const r=await consumeEnergy('player','menu',1); if(!r.ok) throw new Error(JSON.stringify(r));`;
    await Promise.all(Array.from({ length: 12 }, () => runNode(dir, code)));
    const ledger = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(ledger.player.energy, 18);
    assert.equal(ledger.player.commands, 12);
    assert.equal(ledger.player.totalSpent, 12);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('concurrent debit refuses to spend beyond the available balance', async () => {
  const dir = await tempDir('whiskay-energy-overdraw-');
  try {
    const file = path.join(dir, 'energy-ledger.json');
    await writeFile(file, JSON.stringify({ player: { energy: 3, commands: 0, totalSpent: 0 } }));
    const code = `import { consumeEnergy } from '${ENERGY_MODULE}'; const r=await consumeEnergy('player','menu',1); console.log(r.ok ? 'DEBIT_OK' : r.reason);`;
    const results = await Promise.all(Array.from({ length: 10 }, () => runNode(dir, code)));
    const successes = results.filter(result => result.stdout.includes('DEBIT_OK')).length;
    const insufficient = results.filter(result => result.stdout.includes('insufficient-energy')).length;
    const ledger = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(successes, 3);
    assert.equal(insufficient, 7);
    assert.equal(ledger.player.energy, 0);
    assert.equal(ledger.player.commands, 3);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('webhook idempotency claims survive independent processes and restart', async () => {
  const dir = await tempDir('whiskay-webhook-idem-');
  try {
    const claimCode = `import { claimWebhookEvent } from '${WEBHOOK_MODULE}'; const r=await claimWebhookEvent('world-boss:event_12345678'); console.log(r.claimed?'CLAIMED':'DUPLICATE');`;
    const [first, second] = await Promise.all([runNode(dir, claimCode), runNode(dir, claimCode)]);
    assert.equal([first, second].filter(result => result.stdout.includes('CLAIMED')).length, 1);
    assert.equal([first, second].filter(result => result.stdout.includes('DUPLICATE')).length, 1);
    const data = JSON.parse(await readFile(path.join(dir, 'webhook-idempotency.json'), 'utf8'));
    assert.equal(data.version, 1);
    assert.equal(Object.keys(data.events).length, 1);
    assert.equal(Object.values(data.events)[0].status, 'processing');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('webhook store corruption fails closed instead of permitting an untracked send', async () => {
  const dir = await tempDir('whiskay-webhook-corrupt-');
  try {
    await writeFile(path.join(dir, 'webhook-idempotency.json'), '{bad json');
    const code = `import { claimWebhookEvent } from '${WEBHOOK_MODULE}'; try { await claimWebhookEvent('event_12345678'); process.exitCode=2; } catch(e) { if(e.code!=='WHISKAY_DATA_CORRUPT') throw e; console.log('WEBHOOK_BLOCKED'); }`;
    const result = await runNode(dir, code);
    assert.match(result.stdout, /WEBHOOK_BLOCKED/);
    assert.equal(await readFile(path.join(dir, 'webhook-idempotency.json'), 'utf8'), '{bad json');
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test('debit during active charging rebases the charge schedule and cannot restore spent energy', async () => {
  const dir = await tempDir('whiskay-energy-charge-debit-');
  try {
    const file = path.join(dir, 'energy-ledger.json');
    const now = Date.now();
    await writeFile(file, JSON.stringify({ player: {
      energy: 10, maxBatteryCapacity: 100, isCharging: true,
      chargingStartedAt: now - 2520000, chargingStartEnergy: 10,
      chargingEndsAt: now + 20160000, currentVoltSpeed: 5,
      commands: 0, totalSpent: 0
    } }));
    const code = `import { consumeEnergy, getEnergy } from '${ENERGY_MODULE}'; const debit=await consumeEnergy('player','menu',1); if(!debit.ok) throw new Error(JSON.stringify(debit)); const snapshot=await getEnergy('player'); if(Math.abs(snapshot.energy-debit.energy)>0.02) throw new Error('spent energy was restored: '+JSON.stringify({debit,snapshot})); console.log('CHARGE_REBASED');`;
    const result = await runNode(dir, code);
    assert.match(result.stdout, /CHARGE_REBASED/);
    const ledger = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(ledger.player.chargingStartEnergy, ledger.player.energy);
    assert.equal(ledger.player.isCharging, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('full batteries do not trigger periodic passive-regeneration ledger rewrites', async () => {
  const dir = await tempDir('whiskay-energy-full-idle-');
  try {
    const file = path.join(dir, 'energy-ledger.json');
    await writeFile(file, JSON.stringify({ player: { energy: 100, maxBatteryCapacity: 100, commands: 0, totalSpent: 0 } }));
    const code = `import { setAutoRegen, stopAutoRegenWorker } from '${ENERGY_MODULE}'; import { readFile } from 'node:fs/promises'; await setAutoRegen(true); const before=await readFile(${JSON.stringify(file)},'utf8'); await new Promise(resolve=>setTimeout(resolve,5600)); stopAutoRegenWorker(); const after=await readFile(${JSON.stringify(file)},'utf8'); if(before!==after) throw new Error('full-ledger was rewritten by idle regen'); console.log('FULL_LEDGER_UNCHANGED');`;
    const result = await runNode(dir, code);
    assert.match(result.stdout, /FULL_LEDGER_UNCHANGED/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('plugin registry resolves command collisions deterministically and reports them', () => {
  const registry = buildPluginRegistry([
    { name: 'zeta-plugin', command: 'status', aliases: ['info'], __sourceFile: 'zeta/status.js' },
    { name: 'alpha-plugin', command: 'status', aliases: ['health'], __sourceFile: 'alpha/status.js' },
    { name: 'third-plugin', command: 'report', aliases: ['status'], __sourceFile: 'third/report.js' },
    { name: 'fourth-plugin', command: 'other', aliases: ['info'], __sourceFile: 'fourth/other.js' },
  ]);
  assert.equal(registry.commands.get('status').name, 'alpha-plugin');
  assert.equal(registry.aliases.get('health').name, 'alpha-plugin');
  assert.equal(registry.aliases.has('status'), false);
  assert.equal(registry.aliases.get('info').name, 'fourth-plugin');
  assert.ok(registry.conflicts.some(item => item.type === 'duplicate-command' && item.token === 'status'));
  assert.ok(registry.conflicts.some(item => item.type === 'alias-command-collision' && item.token === 'status'));
  assert.ok(registry.conflicts.some(item => item.type === 'duplicate-alias' && item.token === 'info'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('leveling serializes concurrent XP awards without lost updates', async () => {
  const original = process.cwd();
  const oldDataDir = process.env.WHISKAY_DATA_DIR;
  const temp = await mkdtemp(path.join(os.tmpdir(), 'whiskay-stage32-level-'));
  try {
    process.chdir(temp);
    process.env.WHISKAY_DATA_DIR = path.join(temp, 'data');
    const lib = await import('../src/lib/leveling.js?stage32-concurrency');
    await lib.setGroupLeveling('group@g.us', true, 'test');
    await Promise.all(Array.from({ length: 40 }, () => lib.awardMessageXP('group@g.us', 'user@s.whatsapp.net')));
    const profile = await lib.getProfile('group@g.us', 'user@s.whatsapp.net');
    assert.ok(profile.xp > 0 || profile.level > 1);
    assert.ok(profile.points === 40, `expected 40 points, got ${profile.points}`);
    const data = JSON.parse(await readFile(path.join(temp, 'data', 'leveling.json'), 'utf8'));
    assert.equal(data.users['group@g.us|user@s.whatsapp.net'].points, 40);
  } finally { process.chdir(original); if (oldDataDir === undefined) delete process.env.WHISKAY_DATA_DIR; else process.env.WHISKAY_DATA_DIR = oldDataDir; await rm(temp, { recursive: true, force: true }); }
});

test('menu settings include independent widget design, battery visibility, paging and profile widgets', async () => {
  const original = process.cwd();
  const oldDataDir = process.env.WHISKAY_DATA_DIR;
  const temp = await mkdtemp(path.join(os.tmpdir(), 'whiskay-stage32-menu-'));
  try {
    process.chdir(temp);
    process.env.WHISKAY_DATA_DIR = path.join(temp, 'data');
    const lib = await import('../src/lib/menu-settings.js?stage32-defaults');
    const s = await lib.getMenuSettings('user');
    assert.equal(s.widgetDesign, 'classic');
    assert.equal(s.showEnergyWidget, true);
    assert.equal(s.commandPageSize, 100);
    assert.ok(s.profileWidgets.includes('smartenergy'));
    await lib.updateMenuSettings('user', { widgetDesign: 'kawaii', showEnergyWidget: false, commandPageSize: 500 });
    const updated = await lib.getMenuSettings('user');
    assert.equal(updated.widgetDesign, 'kawaii');
    assert.equal(updated.showEnergyWidget, false);
    assert.equal(updated.commandPageSize, 500);
  } finally { process.chdir(original); if (oldDataDir === undefined) delete process.env.WHISKAY_DATA_DIR; else process.env.WHISKAY_DATA_DIR = oldDataDir; await rm(temp, { recursive: true, force: true }); }
});

test('energy middleware blocks paid commands without enough energy and exempts recovery/free commands', async () => {
  const source = await readFile(new URL('../src/middlewares/energy-worker.js', import.meta.url), 'utf8');
  assert.match(source, /canExecuteWithEnergy/);
  assert.match(source, /fail closed|Ledger energi tidak dapat mencatat biaya/i);
  assert.match(source, /ctx\.aborted=true/);

  const { estimateWorkload, canExecuteWithEnergy } = await import('../src/core/WorkloadCortex.js');
  const freeMode = estimateWorkload({ command: 'custom-free', plugin: { energyMode: 'free' } });
  const zeroCost = estimateWorkload({ command: 'custom-zero', plugin: { energyCost: 0 } });
  const paid = estimateWorkload({ command: 'custom-paid', plugin: { energyMode: 'static', energyCost: 1.25 } });

  assert.equal(freeMode.mode, 'exempt');
  assert.equal(freeMode.cost, 0);
  assert.equal(zeroCost.mode, 'exempt');
  assert.equal(zeroCost.cost, 0);
  assert.equal(paid.mode, 'static');
  assert.equal(paid.cost, 1.25);
  assert.equal(canExecuteWithEnergy(0, paid.cost, paid.cost), false, 'zero energy must block a paid command');
  assert.equal(canExecuteWithEnergy(0.5, paid.cost, paid.cost), false, 'insufficient energy must block a paid command');
  assert.equal(canExecuteWithEnergy(paid.cost, paid.cost, paid.cost), true, 'exact balance is sufficient');
  assert.equal(canExecuteWithEnergy(0, freeMode.cost, freeMode.cost), true, 'recovery/free commands do not require energy');
  assert.equal(canExecuteWithEnergy(Number.NaN, paid.cost, paid.cost), false, 'invalid ledger values fail closed');
  assert.equal(canExecuteWithEnergy(100, Number.NaN), false, 'invalid workload estimates fail closed');
});

test('serializer implementation is compat layer, not a separate compact serializer', async () => {
  const source = await readFile(new URL('../src/core/serializer.js', import.meta.url), 'utf8');
  const compat = await readFile(new URL('../src/core/serializer-compat.cjs', import.meta.url), 'utf8');
  assert.match(source, /serializer-compat\.cjs/);
  assert.match(compat, /sock\.sendInteractive/);
  assert.doesNotMatch(source, /serializer-compact\.cjs/);
});

test('owner global menu defaults become baseline while explicit user overrides survive', async () => {
  const original = process.cwd();
  const oldDataDir = process.env.WHISKAY_DATA_DIR;
  const temp = await mkdtemp(path.join(os.tmpdir(), 'whiskay-stage32-global-'));
  try {
    process.chdir(temp);
    process.env.WHISKAY_DATA_DIR = path.join(temp, 'data');
    const lib = await import('../src/lib/menu-settings.js?stage32-global-defaults');
    await lib.updateMenuSettings('custom-user', { template: 'terminal' });
    await lib.setGlobalMenuDefaults({ ...lib.defaultMenuSettings(), template: 'kawaii', widgetDesign: 'japanese' }, 'owner-test');
    assert.equal((await lib.getMenuSettings('new-user')).template, 'kawaii');
    assert.equal((await lib.getMenuSettings('new-user')).widgetDesign, 'japanese');
    assert.equal((await lib.getMenuSettings('custom-user')).template, 'terminal');
  } finally { process.chdir(original); if (oldDataDir === undefined) delete process.env.WHISKAY_DATA_DIR; else process.env.WHISKAY_DATA_DIR = oldDataDir; await rm(temp, { recursive: true, force: true }); }
});

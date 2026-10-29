import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ownerManagementInternals as internals } from '../src/plugins/owner/owner-management.js';

const projectRoot = process.cwd();

function executeIsolated(script, env = {}) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'whiskay-stage38-'));
  try {
    const moduleUrl = pathToFileURL(path.resolve(projectRoot, 'src/plugins/owner/owner-management.js')).href;
    const fullScript = `
      import assert from 'node:assert/strict';
      import { readFile } from 'node:fs/promises';
      import path from 'node:path';
      import { registerUser, getUser, isUserBanActive, updateUser, clearExpiredUserBan } from ${JSON.stringify(pathToFileURL(path.resolve(projectRoot, 'src/lib/app-database.js')).href)};
      import { adjustEnergy, listEnergyUsers } from ${JSON.stringify(pathToFileURL(path.resolve(projectRoot, 'src/lib/energy-worker.js')).href)};
      import { pathToFileURL } from 'node:url';
      const plugin = (await import(${JSON.stringify(moduleUrl)})).default;
      const target = '6281234567890@s.whatsapp.net';
      const actor = '6280000000000@s.whatsapp.net';
      const otherOwner = '6281111111111@s.whatsapp.net';
      await registerUser(target, 'Stage38 Target');
      await registerUser(otherOwner, 'Owner Two');
      const makeCtx = (command, args = [], extra = {}) => ({
        command, args, isOwner: true, sender: actor, chat: actor, prefix: '.', mentions: [],
        replies: [], interactive: [],
        async reply(text) { this.replies.push(String(text)); return text; },
        async sendInteractive(payload) { this.interactive.push(payload); return payload; },
        ...extra
      });
      ${script}
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', fullScript], {
      cwd: temp,
      env: { ...process.env, WHISKAY_DATA_DIR: path.join(temp, 'appdata'), OWNERS: '6280000000000,6281111111111', ...env },
      encoding: 'utf8', timeout: 20000
    });
    if (result.status !== 0) throw new Error(`Isolated Node test failed (status=${result.status}):\n${result.stderr}\n${result.stdout}`);
    return result.stdout.trim();
  } finally {
    // The isolated test writes both its app database and energy ledger only under this temp directory.
    rmSyncSafe(temp);
  }
}

import { mkdtempSync, rmSync as rmSyncRaw } from 'node:fs';
function rmSyncSafe(file) { try { rmSyncRaw(file, { recursive: true, force: true }); } catch {} }

test('Stage 38-I2 target parsing accepts phone JID / bare number and rejects arbitrary strings', () => {
  assert.equal(internals.parseJid('6281234567890'), '6281234567890@s.whatsapp.net');
  assert.equal(internals.parseJid('@6281234567890'), '6281234567890@s.whatsapp.net');
  assert.equal(internals.parseJid('abc; rm -rf /'), '');
  assert.equal(internals.parseJid('z-stage38-lid-test@lid'), 'z-stage38-lid-test@lid');
  assert.match(internals.requireTargetSafety({ sender: '6280000000000@s.whatsapp.net' }, 'z-stage38-lid-test@lid', { preventOwner: true }), /LID yang tidak dapat diverifikasi/i);
});

test('Stage 38-I2 ban duration parser caps duration and keeps legacy permanent bans separate', () => {
  assert.equal(internals.parseDuration('permanent').until, 0);
  assert.equal(internals.parseDuration('2h', 1000).until, 7_201_000);
  assert.equal(internals.parseDuration('20s'), null);
  assert.equal(internals.parseDuration('999w'), null);
  assert.equal(internals.parseDuration('tomorrow'), null);
});

test('Stage 38-I2 mentioned targets are removed without losing command payload', () => {
  const ctx = { mentions: ['6281234567890@s.whatsapp.net'] };
  const parsed = internals.resolveTarget(ctx, ['user', '@6281234567890', 'nickname', 'Arifi Razzaq']);
  assert.equal(parsed.target, '6281234567890@s.whatsapp.net');
  assert.deepEqual(parsed.args, ['user', 'nickname', 'Arifi Razzaq']);
});

test('Stage 38-I2 safe user summary does not serialize arbitrary secrets', () => {
  const rendered = internals.safeUserSummary({ id: '6281234567890@s.whatsapp.net', pushName: 'Test', registered: true, balance: 10, password: 'NEVER-LEAK-THIS', apiKey: 'secret' });
  assert.match(rendered, /Terdaftar: ya/);
  assert.doesNotMatch(rendered, /NEVER-LEAK-THIS|secret|apiKey|password/);
});

test('Stage 38-I2 runtime integration: ban, owner protection, energy audit, and scoped metadata', () => {
  const output = executeIsolated(`
    const targetCtx = (cmd, args) => makeCtx(cmd, args, { mentions: [target] });
    let ctx = targetCtx('banned', ['@6281234567890', '2h', 'repeated spam']);
    await plugin.execute(ctx);
    assert.equal(ctx.interactive.length, 1);
    let user = await getUser(target);
    assert.equal(user.banned, true);
    assert.equal(user.banReason, 'repeated spam');
    assert.equal(isUserBanActive(user), true);

    ctx = makeCtx('banned', ['@6281111111111', '2h', 'owner target'], { mentions: [otherOwner] });
    await plugin.execute(ctx);
    assert.match(ctx.replies[0], /akun owner lain/i);
    assert.equal(isUserBanActive(await getUser(otherOwner)), false);

    await adjustEnergy(target, -30, { actor, reason: 'test-baseline' });
    ctx = targetCtx('addenergy', ['@6281234567890', '10', 'manual credit']);
    await plugin.execute(ctx);
    let energy = await listEnergyUsers(20, 0);
    let row = energy.users.find(item => item.user === target);
    assert.equal(row.energy, 80);
    assert.equal(ctx.interactive.length, 1);

    ctx = targetCtx('kurangenergy', ['@6281234567890', '15', 'penalty']);
    await plugin.execute(ctx);
    energy = await listEnergyUsers(20, 0);
    row = energy.users.find(item => item.user === target);
    assert.equal(row.energy, 65);
    const ledger = JSON.parse(await readFile(path.join(process.env.WHISKAY_DATA_DIR, 'energy-ledger.json'), 'utf8'));
    assert.equal(ledger[target].energyAdminHistory.length >= 3, true);
    assert.equal(ledger[target].energyAdminHistory.at(-1).actor, actor);

    ctx = targetCtx('setdata', ['user', '@6281234567890', 'nickname', 'Nama Owner Test']);
    await plugin.execute(ctx);
    user = await getUser(target);
    assert.equal(user.ownerNickname, 'Nama Owner Test');

    ctx = targetCtx('setdata', ['user', '@6281234567890', 'isAdmin', 'true']);
    await plugin.execute(ctx);
    user = await getUser(target);
    assert.equal(user.isAdmin, undefined);
    assert.match(ctx.replies[0], /Field yang diizinkan/i);

    ctx = targetCtx('deldata', ['user', '@6281234567890', 'nickname']);
    await plugin.execute(ctx);
    user = await getUser(target);
    assert.equal(user.ownerNickname, undefined);

    ctx = targetCtx('listbans', []);
    await plugin.execute(ctx);
    assert.equal(ctx.interactive.length, 1);

    ctx = targetCtx('unbanned', ['@6281234567890']);
    await plugin.execute(ctx);
    user = await getUser(target);
    assert.equal(user.banned, false);

    await updateUser(target, { banned: true, banUntil: Date.now() - 1000, banReason: 'expired test' });
    const expiry = await clearExpiredUserBan(target, Date.now());
    assert.equal(expiry.expired, true);
    assert.equal(expiry.user.banned, false);
    assert.equal(expiry.user.unbannedBy, 'automatic-expiry');
    await updateUser(target, { banned: true, banUntil: 0, banReason: 'legacy permanent' });
    const permanent = await clearExpiredUserBan(target, Date.now());
    assert.equal(permanent.expired, false);
    assert.equal(permanent.user.banned, true);
    console.log('PASS owner management runtime flow');
  `);
  assert.match(output, /PASS owner management runtime flow/);
});

test('Stage 38-I2 command guard is owner-only even if plugin is invoked directly', () => {
  const output = executeIsolated(`
    const ctx = makeCtx('listbans', [], { isOwner: false });
    await plugin.execute(ctx);
    assert.match(ctx.replies[0], /khusus owner/i);
    console.log('PASS non-owner guard');
  `);
  assert.match(output, /PASS non-owner guard/);
});

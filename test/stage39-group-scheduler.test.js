import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

const group = '120363000000000000@g.us';
async function withSettings(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-group-scheduler-'));
  const previous = process.env.WHISKAY_GROUP_SETTINGS_FILE;
  process.env.WHISKAY_GROUP_SETTINGS_FILE = path.join(dir, 'settings.json');
  try {
    const settings = await import(`../src/lib/group-settings.js?test=${Date.now()}-${Math.random()}`);
    const scheduler = await import(`../src/lib/group-scheduler.js?test=${Date.now()}-${Math.random()}`);
    await fn(settings, scheduler);
  } finally {
    if (previous === undefined) delete process.env.WHISKAY_GROUP_SETTINGS_FILE;
    else process.env.WHISKAY_GROUP_SETTINGS_FILE = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

test('Stage 39-I2 persists only valid HH:MM schedules', async () => withSettings(async settings => {
  const saved = await settings.updateGroupSettings(group, { schedule: { closeAt: '22:00', openAt: '07:15', lastCloseDate: null, lastOpenDate: null } });
  assert.equal(saved.schedule.closeAt, '22:00');
  assert.equal(saved.schedule.openAt, '07:15');
  await settings.updateGroupSettings(group, { schedule: { closeAt: '25:80', openAt: 'tomorrow' } });
  const after = await settings.getGroupSettings(group);
  assert.equal(after.schedule.closeAt, '22:00');
  assert.equal(after.schedule.openAt, '07:15');
}));

test('Stage 39-I2 runs scheduled close once per WIB date and then open independently', async () => withSettings(async (settings, scheduler) => {
  const closeAt = Date.UTC(2026, 9, 29, 15, 0); // 22:00 WIB
  const openAt = Date.UTC(2026, 9, 29, 0, 15); // 07:15 WIB
  await settings.updateGroupSettings(group, { schedule: { closeAt: '22:00', openAt: '07:15', lastCloseDate: null, lastOpenDate: null } });
  const calls = [];
  const sock = { async groupSettingUpdate(...args) { calls.push(['setting', ...args]); }, async sendMessage(...args) { calls.push(['message', ...args]); } };
  let result = await scheduler.runGroupSchedules({ sock, now: closeAt });
  assert.equal(result.executed, 1);
  assert.deepEqual(calls[0], ['setting', group, 'announcement']);
  result = await scheduler.runGroupSchedules({ sock, now: closeAt + 30000 });
  assert.equal(result.executed, 0);
  result = await scheduler.runGroupSchedules({ sock, now: openAt });
  assert.equal(result.executed, 1);
  assert.deepEqual(calls.find(x => x[0] === 'setting' && x[2] === 'not_announcement'), ['setting', group, 'not_announcement']);
}));

test('Stage 39-I2 gracefully skips scheduling when socket API is unavailable', async () => withSettings(async (_settings, scheduler) => {
  assert.deepEqual(await scheduler.runGroupSchedules({ sock: {}, now: Date.now() }), { checked: 0, executed: 0, failed: 0 });
}));

test('Stage 39-I2 group schedule command requires admin and accepts only valid time', async () => {
  const plugin = (await import('../src/plugins/general/group-tools.js')).default;
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-group-command-'));
  const previous = process.env.WHISKAY_GROUP_SETTINGS_FILE;
  process.env.WHISKAY_GROUP_SETTINGS_FILE = path.join(dir, 'settings.json');
  try {
    const replies = [];
    const ctx = { command: 'groupschedule', args: ['close','25:00'], isGroup: true, isAdmin: true, isOwner: false, isBotAdmin: true, chat: group, sender: '6280000000000@s.whatsapp.net', sock: { user: { id: '6289999999999@s.whatsapp.net' }, async groupMetadata() { return { participants: [{ id: this.user.id, admin: 'admin' }, { id: ctx.sender, admin: 'admin' }] }; } }, async reply(value) { replies.push(String(value)); }, raw: { key: { id: 'x' } } };
    await plugin.execute(ctx);
    assert.match(replies.at(-1), /Format: \.groupschedule/);
  } finally {
    if (previous === undefined) delete process.env.WHISKAY_GROUP_SETTINGS_FILE;
    else process.env.WHISKAY_GROUP_SETTINGS_FILE = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

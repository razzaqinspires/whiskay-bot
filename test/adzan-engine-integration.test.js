import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'whiskay-adzan-engine-'));
process.env.WHISKAY_DATA_DIR = tempRoot;
const store = await import(`../src/services/AdzanProfileStore.js?engine-test=${Date.now()}`);
const service = await import(`../src/services/AdzanEngineService.js?engine-test=${Date.now()}`);
const adzanPlugin = (await import('../src/plugins/general/adzan.js')).default;
const user = '628555555555@s.whatsapp.net';

test('vendored Razzaq engine calculates five daily prayers using the personal location and timezone', async () => {
  await store.requestAdzanLocation(user);
  await store.saveAdzanSharedLocation(user, { latitude: 3.6985, longitude: 98.6893, name: 'Medan Labuhan' });
  await store.setAdzanTimezone(user, 'Asia/Jakarta');
  const { schedule, profile } = await service.getPersonalAdzanSchedule(user, '2026-10-31');
  assert.equal(profile.timezone, 'Asia/Jakarta');
  assert.equal(schedule.date, '2026-10-31');
  for (const prayer of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) {
    assert.match(schedule.times[prayer].time, /^\d{2}:\d{2}$/);
    assert.ok(Number.isFinite(Date.parse(schedule.times[prayer].at)));
  }
  assert.equal(schedule.method.id, 'indonesia-kemenag-reference');
  assert.equal(schedule.metadata.officialValidation, false);
});

test('personal scheduler sends one DM for a due event and suppresses the next scan', async () => {
  const schedulerUser = '628566666666@s.whatsapp.net';
  await store.requestAdzanLocation(schedulerUser);
  await store.saveAdzanSharedLocation(schedulerUser, { latitude: 3.6985, longitude: 98.6893, name: 'Medan Labuhan' });
  await store.setAdzanTimezone(schedulerUser, 'Asia/Jakarta');
  await store.setPersonalAdzanEnabled(schedulerUser, true);
  const { schedule } = await service.getPersonalAdzanSchedule(schedulerUser, '2026-10-31');
  const sends = [];
  const fakeSock = { sendMessage: async (jid, payload) => { sends.push({ jid, payload }); return {}; } };
  const dueAt = Date.parse(schedule.times.fajr.at) + 5_000;
  const first = await service.runPersonalAdzanScheduler(fakeSock, dueAt);
  const second = await service.runPersonalAdzanScheduler(fakeSock, dueAt + 10_000);
  assert.equal(first.sent, 1);
  assert.equal(second.sent, 0);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].jid, schedulerUser);
  assert.match(sends[0].payload.text, /WAKTU SALAT SUBUH/);
});

test('adzan command enables personal DM subscription and preserves legacy group on/off', async () => {
  const commandUser = '628577777777@s.whatsapp.net';
  await store.requestAdzanLocation(commandUser);
  await store.saveAdzanSharedLocation(commandUser, { latitude: 3.6985, longitude: 98.6893 });
  await store.setAdzanTimezone(commandUser, 'Asia/Jakarta');
  const dmReplies = [];
  await adzanPlugin.execute({
    args: ['on'], sender: commandUser, isGroup: false, prefix: '.',
    reply: async message => { dmReplies.push(message); return message; }
  });
  assert.match(dmReplies[0], /Notifikasi waktu salat pribadi AKTIF/);
  assert.equal((await store.getEffectiveAdzanProfile(commandUser)).adzanEnabled, true);

  const groupReplies = [];
  await adzanPlugin.execute({
    args: ['on'], sender: commandUser, isGroup: true, isAdmin: true, isOwner: false,
    chat: '120363000000000000@g.us', prefix: '.',
    reply: async message => { groupReplies.push(message); return message; }
  });
  assert.match(groupReplies[0], /Pengingat manual grup: AKTIF/);
});

test('personal scheduler only delivers to opted-in users and claims an event once', async () => {
  await store.setPersonalAdzanEnabled(user, true);
  const subscribers = await store.listPersonalAdzanSubscribers();
  assert.ok(subscribers.some(item => item.user === user));
  const first = await store.claimPersonalAdzanEvent(user, 'fajr', '2026-10-31', '2026-10-30T21:52:00.000Z');
  const second = await store.claimPersonalAdzanEvent(user, 'fajr', '2026-10-31', '2026-10-30T21:52:00.000Z');
  assert.equal(first, true);
  assert.equal(second, false);
  await store.setPersonalAdzanEnabled(user, false);
  assert.equal((await store.listPersonalAdzanSubscribers()).some(item => item.user === user), false);
});

test.after(async () => { await rm(tempRoot, { recursive: true, force: true }); });

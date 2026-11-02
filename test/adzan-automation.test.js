import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-adzan-automation-'));
process.env.WHISKAY_DATA_DIR = root;
const store = await import(`../src/services/AdzanProfileStore.js?automation=${Date.now()}`);
const service = await import(`../src/services/AdzanEngineService.js?automation=${Date.now()}`);
const plugin = (await import('../src/plugins/general/adzan.js')).default;
const user = '6285777000001@s.whatsapp.net';

async function setup() {
  await store.requestAdzanLocation(user);
  await store.saveAdzanSharedLocation(user, { latitude: 3.5897, longitude: 98.6738, name: 'Medan' });
  await store.setAdzanTimezone(user, 'Asia/Jakarta');
  await store.setPersonalAdzanEnabled(user, true);
}

function mockSocket() {
  const sent = [];
  return { sent, sock: { sendMessage: async (jid, payload) => { sent.push({ jid, payload }); return { key: { id: `mock-${sent.length}` } }; } } };
}

test('automation preferences validate ranges and expose per-user defaults', async () => {
  await setup();
  const initial = await store.getPersonalAdzanPreferences(user);
  assert.equal(initial.fridayReminderEnabled, false);
  assert.equal(initial.fridayReminderTime, '11:00');
  assert.equal(initial.ramadanReminderEnabled, false);
  assert.equal(initial.sahurReminderMinutes, 30);
  assert.equal(initial.iftarReminderEnabled, true);
  await assert.rejects(store.updatePersonalAdzanSettings(user, { fridayReminderTime: '25:00' }), /HH:mm/);
  await assert.rejects(store.updatePersonalAdzanSettings(user, { sahurReminderMinutes: 121 }), /0 sampai 120/);
  await assert.rejects(store.updatePersonalAdzanSettings(user, { iftarReminderMinutes: 61 }), /0 sampai 60/);
  await store.updatePersonalAdzanSettings(user, {
    fridayReminderEnabled: true, fridayReminderTime: '11:15',
    ramadanReminderEnabled: true, sahurReminderMinutes: 25,
    iftarReminderEnabled: true, iftarReminderMinutes: 7
  });
  const subscriber = (await store.listPersonalAdzanSubscribers()).find(row => row.user === user);
  assert.equal(subscriber.preferences.fridayReminderTime, '11:15');
  assert.equal(subscriber.preferences.sahurReminderMinutes, 25);
  assert.equal(subscriber.preferences.iftarReminderMinutes, 7);
});

test('IANA local time conversion handles a normal offset and rejects nonexistent DST wall time', () => {
  assert.equal(service.localTimeToUtc('2026-11-06', '11:00', 'Asia/Jakarta').toISOString(), '2026-11-06T04:00:00.000Z');
  assert.throws(() => service.localTimeToUtc('2026-03-08', '02:30', 'America/New_York'), /tidak valid/);
});

test('Friday reminder is sent at each user configured local time and deduplicated', async () => {
  await setup();
  await store.updatePersonalAdzanSettings(user, { fridayReminderEnabled: true, fridayReminderTime: '11:00' });
  const { sock, sent } = mockSocket();
  const now = Date.parse('2026-11-06T04:00:05.000Z'); // Friday, 11:00:05 in Asia/Jakarta
  const first = await service.runPersonalAdzanScheduler(sock, now);
  assert.ok(first.automationQueued >= 1);
  assert.ok(sent.some(row => row.jid === user && /PENGINGAT HARI JUMAT/.test(row.payload.text || '')));
  const count = sent.length;
  await service.runPersonalAdzanScheduler(sock, now + 5_000);
  assert.equal(sent.length, count, 'same user/date Jumu\'ah event must not be sent twice');
});

test('Ramadan automation sends separate Sahur and Iftar reminders from local Fajr/Maghrib', async () => {
  await setup();
  await store.updatePersonalAdzanSettings(user, {
    ramadanReminderEnabled: true, sahurReminderMinutes: 30,
    iftarReminderEnabled: true, iftarReminderMinutes: 5
  });
  const { sock, sent } = mockSocket();
  const schedule = (await service.getPersonalAdzanSchedule(user, '2026-02-18')).schedule;
  const fajrAt = Date.parse(schedule.times.fajr.at);
  const sahurNow = fajrAt - 30 * 60_000 + 5_000;
  const sahurResult = await service.runPersonalAdzanScheduler(sock, sahurNow);
  assert.ok(sahurResult.automationQueued >= 1);
  assert.ok(sent.some(row => /PENGINGAT SAHUR/.test(row.payload.text || '')));

  const maghribAt = Date.parse(schedule.times.maghrib.at);
  const iftarNow = maghribAt - 5 * 60_000 + 5_000;
  const iftarResult = await service.runPersonalAdzanScheduler(sock, iftarNow);
  assert.ok(iftarResult.automationQueued >= 1);
  assert.ok(sent.some(row => /PENGINGAT BERBUKA PUASA/.test(row.payload.text || '')));
  assert.ok(sent.every(row => row.jid === user), 'all automated reminders are private DMs');
});

test('changing a location or timezone cancels stale queued events for automatic recalculation', async () => {
  await setup();
  await store.enqueuePersonalAdzanDelivery({
    user, prayer: 'stale-profile-event', date: '2026-11-07', scheduledAt: '2026-11-07T04:00:00.000Z',
    text: 'Old region reminder', audioEnabled: false, textOnly: true
  });
  await store.setAdzanTimezone(user, 'Asia/Makassar');
  const history = await store.getPersonalAdzanActivity(user, 10);
  const stale = history.find(row => row.prayer === 'stale-profile-event');
  assert.equal(stale.status, 'cancelled');
  assert.equal(stale.cancelReason, 'user-timezone-changed');
  const profile = await store.getEffectiveAdzanProfile(user);
  assert.equal(profile.timezone, 'Asia/Makassar');
});

test('private automation commands configure Friday, Ramadan, Sahur and Iftar', async () => {
  await setup();
  const replies = [];
  const ctx = { args: [], sender: user, isGroup: false, prefix: '.', reply: async value => replies.push(value), sendInteractive: async value => replies.push(value) };
  for (const args of [['jumat', '11:20'], ['ramadan', 'on'], ['sahur', '20'], ['iftar', '10']]) {
    ctx.args = args;
    await plugin.execute(ctx);
  }
  const prefs = await store.getPersonalAdzanPreferences(user);
  assert.equal(prefs.fridayReminderEnabled, true);
  assert.equal(prefs.fridayReminderTime, '11:20');
  assert.equal(prefs.ramadanReminderEnabled, true);
  assert.equal(prefs.sahurReminderMinutes, 20);
  assert.equal(prefs.iftarReminderMinutes, 10);
  ctx.args = ['automasi'];
  await plugin.execute(ctx);
  assert.ok(replies.at(-1).buttons.some(button => button.id === '.adzan ramadan off'));
});

test('automation controls reject group usage and the Friday worker skips non-Fridays', async () => {
  await setup();
  const replies = [];
  await plugin.execute({ args: ['ramadan', 'on'], sender: user, isGroup: true, reply: async value => replies.push(value) });
  assert.match(replies[0], /chat pribadi/);
  await store.updatePersonalAdzanSettings(user, { fridayReminderEnabled: true, fridayReminderTime: '11:00' });
  const { sock, sent } = mockSocket();
  const result = await service.runPersonalAdzanScheduler(sock, Date.parse('2026-11-07T04:00:05.000Z'));
  assert.equal(result.automationQueued, 0);
  assert.equal(sent.some(row => /PENGINGAT HARI JUMAT/.test(row.payload.text || '')), false);
});

test.after(async () => { await rm(root, { recursive: true, force: true }); });

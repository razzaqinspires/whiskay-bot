import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-adzan-intelligence-'));
process.env.WHISKAY_DATA_DIR = root;
const store = await import(`../src/services/AdzanProfileStore.js?intelligence=${Date.now()}`);
const service = await import(`../src/services/AdzanEngineService.js?intelligence=${Date.now()}`);
const plugin = (await import('../src/plugins/general/adzan.js')).default;
const user = '628599999999@s.whatsapp.net';

async function setup() {
  await store.requestAdzanLocation(user);
  await store.saveAdzanSharedLocation(user, { latitude: 3.5897, longitude: 98.6738, name: 'Medan' });
  await store.setAdzanTimezone(user, 'Asia/Jakarta');
}

test('intelligence service returns Qibla, estimated Hijri date and next prayer countdown', async () => {
  await setup();
  const result = await service.getPersonalAdzanIntelligence(user, new Date('2026-10-31T00:00:00.000Z'));
  assert.ok(result.qibla.degrees >= 0 && result.qibla.degrees < 360);
  assert.equal(result.qibla.reference, 'true-north');
  assert.ok(result.hijri.day >= 1 && result.hijri.day <= 30);
  assert.equal(result.hijri.calendar, 'tabular-civil');
  assert.ok(result.next.inSeconds >= 0);
  assert.match(service.formatCountdown(3661), /1 jam 1 menit 1 detik/);
});

test('weekly and monthly range use the user timezone and requested number of days', async () => {
  await setup();
  const week = await service.getPersonalAdzanRange(user, 7, '2026-11-01');
  const month = await service.getPersonalAdzanRange(user, 30, '2026-11-01');
  assert.equal(week.length, 7);
  assert.equal(month.length, 30);
  assert.equal(week[0].date, '2026-11-01');
  assert.ok(week[0].times.fajr.time);
});

test('calendar export produces a valid iCalendar document for the personal schedule', async () => {
  await setup();
  const result = await service.getPersonalAdzanCalendarFile(user, '2026-11-01');
  assert.match(result.filename, /2026-11-01\.ics$/);
  assert.match(result.content, /BEGIN:VCALENDAR/);
  assert.match(result.content, /SUMMARY:Waktu Subuh/);
  assert.match(result.content, /END:VCALENDAR/);
});

test('pre-alert setting is bounded, persisted and exposed to subscribers', async () => {
  await setup();
  await assert.rejects(store.updatePersonalAdzanSettings(user, { preAlertMinutes: 31 }), /0 sampai 30/);
  await store.updatePersonalAdzanSettings(user, { preAlertMinutes: 7 });
  await store.setPersonalAdzanEnabled(user, true);
  const profile = await store.getEffectiveAdzanProfile(user);
  const subscriber = (await store.listPersonalAdzanSubscribers()).find(item => item.user === user);
  assert.equal(profile.preAlertMinutes, 7);
  assert.equal(subscriber.preferences.preAlertMinutes, 7);
});

test('scheduler queues and sends pre-alert as text before the prayer time', async () => {
  await setup();
  await store.setPersonalAdzanEnabled(user, true);
  await store.setPersonalAdzanAudioEnabled(user, false);
  await store.updatePersonalAdzanSettings(user, { preAlertMinutes: 5 });
  const { schedule } = await service.getPersonalAdzanSchedule(user, '2026-11-01');
  const fajrAt = Date.parse(schedule.times.fajr.at);
  const now = fajrAt - 5 * 60_000 + 1_000;
  const sent = [];
  const result = await service.runPersonalAdzanScheduler({ sendMessage: async (jid, payload) => { sent.push({ jid, payload }); return {}; } }, now);
  assert.ok(result.sent >= 1);
  assert.ok(sent.some(item => item.jid === user && /PENGINGAT SUBUH/.test(item.payload.text || '')));
});

test('private command handlers expose Qibla, Hijri, weekly, ICS and pre-alert controls', async () => {
  await setup();
  const replies = [];
  await plugin.execute({ args: ['pengingat', '10'], sender: user, isGroup: false, reply: async text => replies.push(text) });
  assert.match(replies.at(-1), /10 menit/);
  const qibla = [];
  await plugin.execute({ args: ['kiblat'], sender: user, isGroup: false, reply: async text => qibla.push(text) });
  assert.match(qibla.at(-1), /ARAH KIBLAT/);
  const weekly = [];
  await plugin.execute({ args: ['mingguan'], sender: user, isGroup: false, reply: async text => weekly.push(text) });
  assert.match(weekly.at(-1), /JADWAL SALAT 7 HARI/);
  let documentPayload;
  await plugin.execute({ args: ['ics'], sender: user, isGroup: false, sock: { sendMessage: async (_chat, payload) => { documentPayload = payload; } }, chat: user });
  assert.equal(documentPayload.mimetype, 'text/calendar');
  assert.ok(Buffer.isBuffer(documentPayload.document));
});

test.after(async () => { await rm(root, { recursive: true, force: true }); });

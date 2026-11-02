import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-adzan-dashboard-'));
process.env.WHISKAY_DATA_DIR = root;
const store = await import(`../src/services/AdzanProfileStore.js?dashboard=${Date.now()}`);
const engine = await import(`../src/services/AdzanEngineService.js?dashboard=${Date.now()}`);
const audio = await import(`../src/services/AdzanAudioService.js?dashboard=${Date.now()}`);
const plugin = (await import('../src/plugins/general/adzan.js')).default;
const user = '628577777777@s.whatsapp.net';

async function setup() {
  await store.requestAdzanLocation(user);
  await store.saveAdzanSharedLocation(user, { latitude: 3.5897, longitude: 98.6738, name: 'Medan' });
  await store.setAdzanTimezone(user, 'Asia/Jakarta');
}

test('personal calculation method and minute corrections persist and affect the schedule', async () => {
  await setup();
  await store.updatePersonalAdzanSettings(user, { methodId: 'mwl', corrections: { fajr: 3, asr: -2 } });
  const profile = await store.getEffectiveAdzanProfile(user);
  assert.equal(profile.methodId, 'mwl');
  assert.equal(profile.corrections.fajr, 3);
  const { schedule } = await engine.getPersonalAdzanSchedule(user, '2026-10-31');
  const baseline = await (await import('../vendor/razzaq-adzan-engine/src/index.mjs')).createAdzanEngine({
    location: { latitude: 3.5897, longitude: 98.6738, name: 'Medan' }, timeZone: 'Asia/Jakarta', method: 'mwl'
  }).getSchedule({ date: '2026-10-31' });
  assert.equal(Date.parse(schedule.times.fajr.at) - Date.parse(baseline.times.fajr.at), 180000);
  assert.equal(Date.parse(schedule.times.asr.at) - Date.parse(baseline.times.asr.at), -120000);
});

test('settings reject invalid method, correction bounds and audio pack', async () => {
  await assert.rejects(store.updatePersonalAdzanSettings(user, { methodId: 'unknown' }), /Metode/);
  await assert.rejects(store.updatePersonalAdzanSettings(user, { corrections: { fajr: 31 } }), /-30 sampai \+30/);
  await assert.rejects(store.updatePersonalAdzanSettings(user, { audioPack: 'remote' }), /Paket audio/);
});

test('audio pack preference is propagated to opted-in scheduler subscribers', async () => {
  await store.setPersonalAdzanEnabled(user, true);
  await store.updatePersonalAdzanSettings(user, { audioPack: 'custom' });
  const subscribers = await store.listPersonalAdzanSubscribers();
  const current = subscribers.find(item => item.user === user);
  assert.equal(current.preferences.audioPack, 'custom');
});

test('custom audio pack resolves only to local custom audio files', () => {
  assert.match(audio.getAdzanAudioPath('fajr', { pack: 'custom' }), /custom-subuh\.mp3$/);
  assert.match(audio.getAdzanAudioPath('isha', { pack: 'custom' }), /custom-umum\.mp3$/);
  assert.match(audio.getAdzanAudioPath('fajr'), /subuh\.mp3$/);
});

test('personal activity is isolated to the requesting user', async () => {
  await store.enqueuePersonalAdzanDelivery({ user, prayer: 'fajr', date: '2026-10-31', scheduledAt: '2026-10-31T21:00:00.000Z', text: 'test', now: Date.now() });
  const rows = await store.getPersonalAdzanActivity(user, 10);
  assert.ok(rows.some(row => row.prayer === 'fajr'));
  assert.deepEqual(await store.getPersonalAdzanActivity('628566666666@s.whatsapp.net'), []);
});

test('interactive dashboard offers history and calculation controls', async () => {
  await setup();
  const sent = [];
  await plugin.execute({ args: ['status'], sender: user, isGroup: false, prefix: '.', sendInteractive: async value => sent.push(value) });
  assert.equal(sent.length, 1);
  assert.ok(sent[0].buttons.some(button => button.id === '.adzan riwayat'));
  assert.ok(sent[0].buttons.some(button => button.id === '.adzan metode status'));
});

test.after(async () => { await rm(root, { recursive: true, force: true }); });

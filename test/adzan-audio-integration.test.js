import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'whiskay-adzan-audio-'));
const audioRoot = path.join(tempRoot, 'audio');
process.env.WHISKAY_DATA_DIR = path.join(tempRoot, 'data');
process.env.ADZAN_AUDIO_DIR = audioRoot;
const store = await import(`../src/services/AdzanProfileStore.js?audio-test=${Date.now()}`);
const audio = await import(`../src/services/AdzanAudioService.js?audio-test=${Date.now()}`);
const engine = await import(`../src/services/AdzanEngineService.js?audio-test=${Date.now()}`);
const plugin = (await import('../src/plugins/general/adzan.js')).default;
const user = '628599999999@s.whatsapp.net';

async function setupUser() {
  await store.requestAdzanLocation(user);
  await store.saveAdzanSharedLocation(user, { latitude: 3.6985, longitude: 98.6893, name: 'Medan' });
  await store.setAdzanTimezone(user, 'Asia/Jakarta');
  await store.setPersonalAdzanEnabled(user, true);
}

test('audio resolver uses dedicated Fajr audio and shared audio for other prayers', async () => {
  await mkdir(audioRoot, { recursive: true });
  await writeFile(path.join(audioRoot, 'subuh.mp3'), Buffer.from('ID3-fajr-audio'));
  await writeFile(path.join(audioRoot, 'umum.mp3'), Buffer.from('ID3-general-audio'));
  const fajr = await audio.loadAdzanAudio('fajr');
  const maghrib = await audio.loadAdzanAudio('maghrib');
  assert.equal(fajr.fileName, 'subuh.mp3');
  assert.equal(maghrib.fileName, 'umum.mp3');
  assert.equal(fajr.mimetype, 'audio/mpeg');
  assert.equal((await audio.getAdzanAudioStatus()).files.fajr.available, true);
});

test('personal scheduler sends MP3 as WhatsApp audio with prayer caption', async () => {
  await setupUser();
  const { schedule } = await engine.getPersonalAdzanSchedule(user, '2026-10-31');
  const sent = [];
  const sock = { sendMessage: async (jid, payload) => { sent.push({ jid, payload }); return {}; } };
  const result = await engine.runPersonalAdzanScheduler(sock, Date.parse(schedule.times.fajr.at) + 2_000);
  assert.equal(result.audioSent, 1);
  assert.equal(result.textFallback, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].jid, user);
  assert.equal(sent[0].payload.fileName, 'subuh.mp3');
  assert.match(sent[0].payload.caption, /WAKTU SALAT SUBUH/);
});

test('user can turn audio off and still receive text reminder', async () => {
  const replies = [];
  await plugin.execute({ args: ['audio', 'off'], sender: user, isGroup: false, reply: async m => replies.push(m) });
  assert.match(replies[0], /Audio adzan dinonaktifkan/);
  const prefs = await store.getPersonalAdzanPreferences(user);
  assert.equal(prefs.audioEnabled, false);
  const { schedule } = await engine.getPersonalAdzanSchedule(user, '2026-11-01');
  const sent = [];
  const sock = { sendMessage: async (jid, payload) => { sent.push({ jid, payload }); return {}; } };
  const result = await engine.runPersonalAdzanScheduler(sock, Date.parse(schedule.times.fajr.at) + 2_000);
  assert.equal(result.textFallback, 1);
  assert.equal(sent[0].payload.audio, undefined);
  assert.match(sent[0].payload.text, /Audio dinonaktifkan/);
});

test('missing audio files safely fall back to text and reject unsupported prayer keys', async () => {
  await rm(audioRoot, { recursive: true, force: true });
  assert.equal(await audio.loadAdzanAudio('not-a-prayer'), null);
  assert.equal(await audio.loadAdzanAudio('fajr'), null);
});

test.after(async () => { await rm(tempRoot, { recursive: true, force: true }); });

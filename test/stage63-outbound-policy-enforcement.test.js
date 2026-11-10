import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { JobLoader } from '../src/core/JobLoader.js';
import { WorkloadTracker } from '../src/core/WorkloadTracker.js';
import { WorkloadScheduler } from '../src/core/WorkloadScheduler.js';
import { OutboundTrafficGuard, messageFingerprint, runWithOutboundContext } from '../src/core/OutboundTrafficGuard.js';

function makeTracker(options = {}) {
  let now = 1_800_000_000_000;
  const root = mkdtempSync(path.join(os.tmpdir(), 'whiskay-stage63-'));
  const tracker = new WorkloadTracker({
    now: () => now,
    storageFile: path.join(root, 'telemetry.json'),
    sharedPolicyFile: path.join(root, 'outbound-policy.json'),
    outboundGlobalMaxPerMinute: 20,
    outboundRecipientMaxPerMinute: 4,
    outboundDuplicateWindowMs: 30000,
    outboundMinIntervalMs: 0,
    ...options,
  });
  tracker.persist = async () => {};
  tracker.advance = ms => { now += ms; };
  tracker.dispose = () => { tracker.delay.disable(); rmSync(root, { recursive: true, force: true }); };
  return tracker;
}

function socket() {
  const sent = [];
  return { sent, sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: `m-${sent.length}` } }; } };
}

test('Stage 63: final send boundary rechecks the rolling global limit', async () => {
  const tracker = makeTracker({ outboundGlobalMaxPerMinute: 3, outboundRecipientMaxPerMinute: 3 });
  try {
    const a = await tracker.reserveOutbound({ recipientKey: 'a'.repeat(24), fingerprint: '1'.repeat(24), source: 'test:first' });
    const b = await tracker.reserveOutbound({ recipientKey: 'b'.repeat(24), fingerprint: '2'.repeat(24), source: 'test:second' });
    const c = await tracker.reserveOutbound({ recipientKey: 'c'.repeat(24), fingerprint: '3'.repeat(24), source: 'test:third' });
    assert.equal(a.allowed && b.allowed && c.allowed, true);
    await tracker.startOutbound(a.id); await tracker.completeOutbound(a.id, 'sent');
    await tracker.startOutbound(b.id); await tracker.completeOutbound(b.id, 'sent');
    tracker.outboundPolicy.globalMaxPerMinute = 2;
    await assert.rejects(tracker.startOutbound(c.id), error => error.code === 'WHISKAY_OUTBOUND_FINAL_POLICY_BLOCKED' && error.policy.reason === 'global-rate-limit-final-boundary');
    const state = await tracker.outboundStore.snapshot();
    assert.equal(state.events.find(row => row.id === c.id).outcome, 'failed');
  } finally { tracker.dispose(); }
});

test('Stage 63: final send boundary rechecks the per-recipient limit', async () => {
  const tracker = makeTracker({ outboundGlobalMaxPerMinute: 10, outboundRecipientMaxPerMinute: 3 });
  try {
    const recipient = 'a'.repeat(24);
    const first = await tracker.reserveOutbound({ recipientKey: recipient, fingerprint: '1'.repeat(24), source: 'test:first' });
    const second = await tracker.reserveOutbound({ recipientKey: recipient, fingerprint: '2'.repeat(24), source: 'test:second' });
    const third = await tracker.reserveOutbound({ recipientKey: recipient, fingerprint: '3'.repeat(24), source: 'test:third' });
    await tracker.startOutbound(first.id); await tracker.completeOutbound(first.id, 'sent');
    await tracker.startOutbound(second.id); await tracker.completeOutbound(second.id, 'sent');
    tracker.outboundPolicy.recipientMaxPerMinute = 2;
    await assert.rejects(tracker.startOutbound(third.id), error => error.code === 'WHISKAY_OUTBOUND_FINAL_POLICY_BLOCKED' && error.policy.reason === 'recipient-rate-limit-final-boundary');
  } finally { tracker.dispose(); }
});

test('Stage 63: a stale queued reservation expires instead of being sent after a rolling window', async () => {
  const tracker = makeTracker({ outboundGlobalMaxPerMinute: 5, outboundRecipientMaxPerMinute: 5 });
  try {
    const pending = await tracker.reserveOutbound({ recipientKey: 'd'.repeat(24), fingerprint: '4'.repeat(24), source: 'test:stale' });
    tracker.advance(121000);
    await assert.rejects(tracker.startOutbound(pending.id), error => error.code === 'WHISKAY_OUTBOUND_FINAL_POLICY_BLOCKED' && error.policy.reason === 'reservation-expired');
  } finally { tracker.dispose(); }
});

test('Stage 63: media fingerprints use content identity and avoid type-only collisions', () => {
  const first = messageFingerprint({ image: Buffer.from('image-bytes-A'), caption: 'same caption' });
  const same = messageFingerprint({ image: Buffer.from('image-bytes-A'), caption: 'same caption' });
  const different = messageFingerprint({ image: Buffer.from('image-bytes-B'), caption: 'same caption' });
  assert.equal(first, same);
  assert.notEqual(first, different);
  assert.equal(messageFingerprint({ image: { mimetype: 'image/jpeg', fileLength: 100, caption: 'same' } }), '');
});

test('Stage 63: Baileys media fingerprint ignores volatile encryption/path metadata', () => {
  const fileHash = Buffer.from('stable-file-sha256');
  const first = messageFingerprint({ imageMessage: { fileSha256: fileHash, mediaKey: Buffer.from('key-one'), directPath: '/one', mimetype: 'image/jpeg', caption: 'hello' } });
  const second = messageFingerprint({ imageMessage: { fileSha256: fileHash, mediaKey: Buffer.from('key-two'), directPath: '/two', mimetype: 'image/jpeg', caption: 'hello' } });
  assert.equal(first, second);
});

test('Stage 63: missing and placeholder source attribution is rejected before transport', async () => {
  const tracker = makeTracker();
  const scheduler = new WorkloadScheduler({ concurrency: 1, minIntervalMs: 0 });
  const guard = new OutboundTrafficGuard({ tracker, scheduler });
  const sock = socket(); guard.attach(sock);
  try {
    await assert.rejects(sock.sendMessage('628111111111@s.whatsapp.net', { text: 'must not send' }), error => error.code === 'WHISKAY_OUTBOUND_SOURCE_REQUIRED');
    assert.throws(() => runWithOutboundContext({ source: 'unattributed' }, () => true), error => error.code === 'WHISKAY_OUTBOUND_SOURCE_REQUIRED');
    assert.equal(sock.sent.length, 0);
  } finally { await guard.close(); tracker.dispose(); }
});

test('Stage 63: explicit source context reaches the final send guard', async () => {
  const tracker = makeTracker();
  const scheduler = new WorkloadScheduler({ concurrency: 1, minIntervalMs: 0 });
  const guard = new OutboundTrafficGuard({ tracker, scheduler });
  const sock = socket(); guard.attach(sock);
  try {
    await runWithOutboundContext({ source: 'test:explicit' }, () => sock.sendMessage('628111111111@s.whatsapp.net', { text: 'source tracked' }));
    assert.equal(sock.sent.length, 1);
    assert.deepEqual(tracker.outboundStats().recentSources, { 'test:explicit': 1 });
  } finally { await guard.close(); tracker.dispose(); }
});


test('Stage 63: JobLoader attributes scheduled sends with their stable job source', async () => {
  const tracker = makeTracker();
  const scheduler = new WorkloadScheduler({ concurrency: 1, minIntervalMs: 0 });
  const guard = new OutboundTrafficGuard({ tracker, scheduler });
  const sock = socket(); guard.attach(sock);
  const root = mkdtempSync(path.join(os.tmpdir(), 'whiskay-stage63-job-'));
  const chronos = { jobs: new Map(), register(job) { this.jobs.set(job.name, job); } };
  try {
    writeFileSync(path.join(root, 'scheduled-test.js'), `export default { name: 'stage63-scheduler-test', intervalMs: 1000, run: async ({ sock }) => sock.sendMessage('628111111111@s.whatsapp.net', { text: 'scheduled' }) };`);
    const loader = new JobLoader({ root, chronos, context: () => ({ sock }) });
    const loaded = await loader.load();
    assert.deepEqual(loaded.loaded, ['stage63-scheduler-test']);
    await chronos.jobs.get('stage63-scheduler-test').run({ now: Date.now() });
    assert.equal(sock.sent.length, 1);
    assert.deepEqual(tracker.outboundStats().recentSources, { 'schedule:stage63-scheduler-test': 1 });
  } finally {
    await guard.close(); tracker.dispose(); rmSync(root, { recursive: true, force: true });
  }
});

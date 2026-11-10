import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { OutboundPolicyStore } from '../src/core/OutboundPolicyStore.js';
import { OutboundTrafficGuard, runWithOutboundContext } from '../src/core/OutboundTrafficGuard.js';
import { WorkloadScheduler } from '../src/core/WorkloadScheduler.js';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'whiskay-outbound-delivery-'));
}
const hash = n => String(n).padStart(24, '0');

test('recipient rate limit becomes deferred queue reservation, not a dropped reply', async () => {
  const dir = await tempDir();
  try {
    const store = new OutboundPolicyStore({ file: path.join(dir, 'policy.json'), windowMs: 120 });
    const first = await store.reserve({ recipientKey: hash(1), fingerprint: hash(101), source: 'command:leaderboard', recipientMaxPerMinute: 1 });
    assert.equal(first.allowed, true);
    await store.start(first.id, { minIntervalMs: 0, recipientMaxPerMinute: 1, globalMaxPerMinute: 10, reservationMaxAgeMs: 600000 });
    await store.complete(first.id, 'sent');

    const second = await store.reserve({ recipientKey: hash(1), fingerprint: hash(102), source: 'command:leaderboard', recipientMaxPerMinute: 1 });
    assert.equal(second.allowed, true);
    assert.equal(second.deferred, true);
    assert.ok(second.deferredReasons.includes('recipient-rate-limit'));

    const startedAt = Date.now();
    const started = await store.start(second.id, {
      minIntervalMs: 0, recipientMaxPerMinute: 1, globalMaxPerMinute: 10,
      reservationMaxAgeMs: 600000, maxWaitMs: 2000,
    });
    assert.equal(started.started, true);
    assert.ok(Date.now() - startedAt >= 90, 'dispatch must wait for recipient rolling window');
    await store.complete(second.id, 'sent');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('global rate limit is deferred until a shared send slot becomes available', async () => {
  const dir = await tempDir();
  try {
    const store = new OutboundPolicyStore({ file: path.join(dir, 'policy.json'), windowMs: 100 });
    const first = await store.reserve({ recipientKey: hash(1), fingerprint: hash(201), source: 'command:one', globalMaxPerMinute: 1, recipientMaxPerMinute: 5 });
    await store.start(first.id, { minIntervalMs: 0, globalMaxPerMinute: 1, recipientMaxPerMinute: 5 });
    await store.complete(first.id, 'sent');
    const second = await store.reserve({ recipientKey: hash(2), fingerprint: hash(202), source: 'command:two', globalMaxPerMinute: 1, recipientMaxPerMinute: 5 });
    assert.equal(second.allowed, true);
    assert.equal(second.deferred, true);
    const startedAt = Date.now();
    await store.start(second.id, { minIntervalMs: 0, globalMaxPerMinute: 1, recipientMaxPerMinute: 5, maxWaitMs: 2000 });
    assert.ok(Date.now() - startedAt >= 75);
    await store.complete(second.id, 'sent');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('duplicate payload suppression remains a hard safety block', async () => {
  const dir = await tempDir();
  try {
    const store = new OutboundPolicyStore({ file: path.join(dir, 'policy.json') });
    const first = await store.reserve({ recipientKey: hash(3), fingerprint: hash(303), source: 'command:menu' });
    assert.equal(first.allowed, true);
    const duplicate = await store.reserve({ recipientKey: hash(3), fingerprint: hash(303), source: 'command:menu' });
    assert.equal(duplicate.allowed, false);
    assert.equal(duplicate.reason, 'duplicate-payload-window');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('source quarantine remains a hard block and is never queued', async () => {
  const dir = await tempDir();
  try {
    const store = new OutboundPolicyStore({ file: path.join(dir, 'policy.json') });
    await store.quarantine('command:unsafe', { ttlMs: 60000, reason: 'test' });
    const result = await store.reserve({ recipientKey: hash(4), fingerprint: hash(404), source: 'command:unsafe' });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'source-quarantine');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('OutboundTrafficGuard queues the actual send through a worker instead of rejecting on recipient pressure', async () => {
  let started = 0;
  const tracker = {
    async reserveOutbound() { return { allowed: true, id: 'reservation-1', deferred: true, deferredReasons: ['recipient-rate-limit'], score: 46 }; },
    async startOutbound() { started++; },
    async completeOutbound() {},
  };
  const scheduler = new WorkloadScheduler({ concurrency: 1, perLaneConcurrency: 1, minIntervalMs: 0, maxQueue: 10 });
  const guard = new OutboundTrafficGuard({ tracker, scheduler });
  const calls = [];
  const original = async (jid, content) => { calls.push({ jid, content }); return { key: { id: 'sent-1' } }; };
  try {
    const result = await runWithOutboundContext({ source: 'command:leaderboard', command: 'leaderboard' }, () =>
      guard.send(original, '628123@s.whatsapp.net', { text: 'Leaderboard result' }));
    assert.equal(started, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].content.text, 'Leaderboard result');
    assert.equal(result.key.id, 'sent-1');
  } finally { await guard.close(); }
});

test('invalid/unattributed sends remain rejected', async () => {
  const tracker = { async reserveOutbound() { throw new Error('must not reserve'); } };
  const scheduler = new WorkloadScheduler({ concurrency: 1, perLaneConcurrency: 1, minIntervalMs: 0, maxQueue: 2 });
  const guard = new OutboundTrafficGuard({ tracker, scheduler });
  try {
    await assert.rejects(() => guard.send(async () => true, '628123@s.whatsapp.net', { text: 'x' }), /explicit source attribution/);
  } finally { await guard.close(); }
});


test('owner ops center exposes outbound worker queue diagnostics', async () => {
  const source = await readFile(new URL('../src/plugins/owner/ops-center.js', import.meta.url), 'utf8');
  assert.match(source, /outboundstatus/);
  assert.match(source, /outboundTrafficGuard\.stats/);
  assert.match(source, /workloadTracker\.outboundStats/);
  assert.match(source, /Queue depth/);
  assert.match(source, /Queue wait maksimum/);
});

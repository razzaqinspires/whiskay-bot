import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-adzan-reliability-'));
process.env.WHISKAY_DATA_DIR = root;
const store = await import(`../src/services/AdzanProfileStore.js?reliability=${Date.now()}`);
const service = await import(`../src/services/AdzanEngineService.js?reliability=${Date.now()}`);
const plugin = (await import('../src/plugins/general/adzan.js')).default;
const user = '628588888888@s.whatsapp.net';

async function configureSubscriber() {
  await store.requestAdzanLocation(user);
  await store.saveAdzanSharedLocation(user, { latitude: 3.6985, longitude: 98.6893, name: 'Medan' });
  await store.setAdzanTimezone(user, 'Asia/Jakarta');
  await store.setPersonalAdzanEnabled(user, true);
  await store.setPersonalAdzanAudioEnabled(user, false);
}

test('failed DM is persisted and retried after the first backoff window', async () => {
  await configureSubscriber();
  const { schedule } = await service.getPersonalAdzanSchedule(user, '2026-10-31');
  const dueAt = Date.parse(schedule.times.fajr.at) + 5_000;
  let calls = 0;
  const flakySock = { sendMessage: async () => { calls++; if (calls === 1) throw new Error('simulated disconnect'); return {}; } };
  const first = await service.runPersonalAdzanScheduler(flakySock, dueAt);
  assert.equal(first.failed, 1);
  assert.equal(first.retried, 1);
  assert.equal(first.outbox.queued, 1);
  const second = await service.runPersonalAdzanScheduler(flakySock, dueAt + 60_000);
  assert.equal(second.sent, 1);
  assert.equal(second.outbox.delivered, 1);
  assert.equal(calls, 2);
});

test('outbox lease prevents concurrent duplicate workers and permits recovery after lease expiry', async () => {
  const key = `${user}:2026-10-31:asr`;
  const now = Date.parse('2026-10-31T11:00:00.000Z');
  await store.enqueuePersonalAdzanDelivery({ user, prayer: 'asr', date: '2026-10-31', scheduledAt: new Date(now).toISOString(), text: 'lease test', now });
  const first = await store.claimPersonalAdzanDelivery(key, { now, leaseMs: 60_000 });
  const concurrent = await store.claimPersonalAdzanDelivery(key, { now: now + 1_000, leaseMs: 60_000 });
  assert.equal(first.status, 'sending');
  assert.equal(concurrent, null);
  const recovered = await store.claimPersonalAdzanDelivery(key, { now: now + 61_000, leaseMs: 60_000 });
  assert.equal(recovered.status, 'sending');
  await store.finishPersonalAdzanDelivery(key, { success: true, now: now + 62_000 });
});

test('delivery queue stops after five failed attempts and records a dead-letter item', async () => {
  const key = `${user}:2026-10-31:isha`;
  const base = Date.parse('2026-10-31T12:00:00.000Z');
  await store.enqueuePersonalAdzanDelivery({ user, prayer: 'isha', date: '2026-10-31', scheduledAt: new Date(base).toISOString(), text: 'test', audioEnabled: false, now: base });
  let now = base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const due = await store.listDuePersonalAdzanDeliveries(now);
    assert.ok(due.some(item => item.key === key));
    const claimed = await store.claimPersonalAdzanDelivery(key, { now });
    assert.ok(claimed);
    const result = await store.finishPersonalAdzanDelivery(key, { success: false, error: `failure-${attempt + 1}`, now });
    if (attempt < 4) { assert.equal(result.status, 'queued'); now = result.nextAttemptAt; }
    else assert.equal(result.status, 'dead');
  }
  const stats = await store.getPersonalAdzanDeliveryStats();
  assert.equal(stats.dead, 1);
});

test('owner control center is restricted and reports durable outbox metrics', async () => {
  const nonOwner = [];
  await plugin.execute({ args: ['admin'], sender: user, isOwner: false, reply: async value => nonOwner.push(value) });
  assert.match(nonOwner[0], /hanya tersedia untuk owner/i);
  const owner = [];
  await plugin.execute({ args: ['admin'], sender: user, isOwner: true, reply: async value => owner.push(value) });
  assert.match(owner[0], /ADZAN CONTROL CENTER/);
  assert.match(owner[0], /Delivery Outbox/);
});

test.after(async () => { await rm(root, { recursive: true, force: true }); });

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDurableEventOutbox } from '../src/lib/durable-event-outbox.js';

let dir;
test.beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-outbox-')); });
test.afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
test('outbox persists events and suppresses duplicate idempotency keys', async () => {
  const filePath = path.join(dir, 'events.json'); const a = createDurableEventOutbox({ filePath });
  const event = await a.enqueue({ eventId: 'event_000001', idempotencyKey: 'purchase_123', type: 'economy.transaction.created', payload: { amount: 10 } });
  const duplicate = await a.enqueue({ eventId: 'event_000002', idempotencyKey: 'purchase_123', type: 'economy.transaction.created', payload: { amount: 10 } });
  assert.equal(event.status, 'pending'); assert.equal(duplicate.duplicate, true);
  const restarted = createDurableEventOutbox({ filePath }); assert.equal((await restarted.pending()).length, 1);
});
test('outbox applies exponential retry and dead-letter limit', async () => {
  let clock = 1000; const outbox = createDurableEventOutbox({ filePath: path.join(dir, 'events.json'), maxAttempts: 2, now: () => clock });
  await outbox.enqueue({ eventId: 'event_000003', type: 'world.event.updated', payload: {} });
  await outbox.markFailed('event_000003', 'network'); assert.equal((await outbox.pending()).length, 0);
  clock += 1000; await outbox.markFailed('event_000003', 'network'); assert.equal((await outbox.stats()).dead, 1);
});
test('outbox rejects unknown event types and malformed payloads', async () => {
  const outbox = createDurableEventOutbox({ filePath: path.join(dir, 'events.json') });
  await assert.rejects(outbox.enqueue({ type: 'admin.exec', payload: {} }), /event_type_not_allowed/);
  await assert.rejects(outbox.enqueue({ type: 'world.event.updated', payload: [] }), /invalid_event_payload/);
});

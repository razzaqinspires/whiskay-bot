import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventEnvelope, createIdempotentProcessor, retryDelayMs } from '../src/lib/stage28-event-processor.js';

test('event envelope validates type and creates stable ID', () => { const e = createEventEnvelope('player.snapshot.updated', { level: 2 }, { eventId: 'evt-1' }); assert.equal(e.event_id, 'evt-1'); assert.equal(e.schema_version, 1); assert.throws(() => createEventEnvelope('BAD TYPE', {})); });
test('processor handles an event once and identifies duplicates', async () => { let calls = 0; const run = createIdempotentProcessor({ handle: async () => { calls++; } }); const e = { event_id: 'evt-2' }; assert.equal((await run(e)).status, 'processed'); assert.equal((await run(e)).status, 'duplicate'); assert.equal(calls, 1); });
test('failed handler does not mark event processed', async () => { let calls = 0; const run = createIdempotentProcessor({ handle: async () => { calls++; if (calls === 1) throw Error('retry'); } }); const e = { event_id: 'evt-3' }; await assert.rejects(run(e)); assert.equal((await run(e)).status, 'processed'); });
test('retry delay is exponential and capped', () => { assert.equal(retryDelayMs(0), 1000); assert.equal(retryDelayMs(3), 8000); assert.equal(retryDelayMs(20), 300000); });

import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkloadScheduler } from '../src/core/WorkloadScheduler.js';
import { ChronosCortex } from '../src/core/ChronosCortex.js';
import { ReloadQueue } from '../src/core/ReloadQueue.js';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('Stage 62: close cancels a job waiting for pacing and rejects its promise', async () => {
  const gate = deferred();
  const scheduler = new WorkloadScheduler({ concurrency: 2, minIntervalMs: 1000, now: () => 1000, sleep: () => gate.promise });
  const first = scheduler.enqueue({ run: () => gate.promise });
  await new Promise(r => setImmediate(r));
  const second = scheduler.enqueue({ lane: 'other', run: async () => 'must-not-run' });
  await new Promise(r => setImmediate(r));
  assert.equal(scheduler.stats().pendingStarts, 1);
  const closing = scheduler.close({ cancelPending: true });
  await assert.rejects(second, /Scheduler closed/);
  assert.equal(await scheduler.waitForIdle({ timeoutMs: 20 }), false, 'active job must remain visible while pending');
  // The pacing wait is cancelled immediately even though the injected sleeper is still unresolved.
  await closing;
  gate.resolve('ok');
  assert.equal(await first, 'ok');
  assert.equal(await scheduler.waitForIdle(), true);
  assert.equal(scheduler.stats().pendingStarts, 0);
  assert.equal(scheduler.stats().pumping, false);
});

test('Stage 62: scheduler close rejects queued jobs and does not strand promises', async () => {
  const gate = deferred();
  const scheduler = new WorkloadScheduler({ concurrency: 1, minIntervalMs: 0 });
  const running = scheduler.enqueue({ run: () => gate.promise });
  const queued = scheduler.enqueue({ lane: 'other', run: async () => 'no' });
  await new Promise(r => setImmediate(r));
  await scheduler.close({ cancelPending: true });
  await assert.rejects(queued, /Scheduler closed/);
  gate.resolve('done'); await running;
  assert.equal(await scheduler.waitForIdle(), true);
  assert.deepEqual(scheduler.stats().lanes, [], 'empty lanes must be pruned after cancellation');
});

test('Stage 62: Chronos runs due jobs concurrently up to configured limit', async () => {
  const chronos = new ChronosCortex({ concurrency: 2, now: () => 5000 });
  let active = 0; let peak = 0;
  const run = async () => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 30)); active--; };
  chronos.register({ name: 'job-one', intervalMs: 1000, initialDelayMs: 0, run });
  chronos.register({ name: 'job-two', intervalMs: 1000, initialDelayMs: 0, run });
  await chronos.tick();
  assert.equal(peak, 2);
});

test('Stage 62: overlapping Chronos ticks are single-flight', async () => {
  const gate = deferred(); let calls = 0;
  const chronos = new ChronosCortex({ concurrency: 1, now: () => 5000 });
  chronos.register({ name: 'single-flight', intervalMs: 1000, initialDelayMs: 0, run: async () => { calls++; await gate.promise; } });
  const a = chronos.tick(); const b = chronos.tick();
  await new Promise(r => setImmediate(r));
  assert.equal(calls, 1); gate.resolve(); await Promise.all([a, b]);
});

test('Stage 62: Chronos stop waits for active jobs and prevents new ticks', async () => {
  const gate = deferred(); const chronos = new ChronosCortex({ now: () => 5000 });
  chronos.register({ name: 'shutdown-job', intervalMs: 1000, initialDelayMs: 0, run: () => gate.promise });
  const ticking = chronos.tick(); await new Promise(r => setImmediate(r));
  const stopping = chronos.stop({ wait: true, timeoutMs: 1000 });
  gate.resolve(); await Promise.all([ticking, stopping]);
  assert.equal(chronos.status().running, 0);
  assert.equal(chronos.start(), false);
});

test('Stage 62: ReloadQueue close drains active work and rejects future pushes', async () => {
  const gate = deferred(); const queue = new ReloadQueue(async () => gate.promise);
  const run = queue.push('test'); await new Promise(r => setImmediate(r));
  const closing = queue.close({ wait: true }); gate.resolve(); await Promise.all([run, closing]);
  await assert.rejects(queue.push('after-close'), /Reload queue closed/);
});


test('Stage 62: Chronos registers a job as running before invoking its callback', async () => {
  const chronos = new ChronosCortex({ now: () => 5000 });
  let runningDuringCallback = 0;
  chronos.register({ name: 'reentrant-job', intervalMs: 1000, initialDelayMs: 0, run: async () => { runningDuringCallback = chronos.status().running; } });
  await chronos.tick();
  assert.equal(runningDuringCallback, 1);
  assert.equal(chronos.status().running, 0);
});

test('Stage 62: pause blocks manual ticks until resumed', async () => {
  const chronos = new ChronosCortex({ now: () => 5000 });
  let calls = 0;
  chronos.register({ name: 'pause-check', intervalMs: 1000, initialDelayMs: 0, run: async () => { calls++; } });
  await chronos.pause();
  await chronos.tick();
  assert.equal(calls, 0);
  assert.equal(chronos.resume(), true);
  await chronos.tick();
  assert.equal(calls, 1);
  await chronos.stop();
});

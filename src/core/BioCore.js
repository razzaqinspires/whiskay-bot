import { workloadTracker } from './WorkloadTracker.js';

/** Deterministic runtime self-regulation snapshot. This is software telemetry/policy, not sentience. */
export function getBioCoreSnapshot() {
  const sample = workloadTracker.sample();
  const pressure = Number(sample.score || 0);
  const state = pressure >= 80 ? 'protect' : pressure >= 55 ? 'conserve' : pressure >= 25 ? 'balanced' : 'normal';
  const policy = state === 'protect' ? { maxConcurrent: 1, queueAdmission: 'strict' } : state === 'conserve' ? { maxConcurrent: 2, queueAdmission: 'bounded' } : state === 'balanced' ? { maxConcurrent: 3, queueAdmission: 'bounded' } : { maxConcurrent: 4, queueAdmission: 'normal' };
  return { state, pressure, policy, telemetry: { cpuPercent: sample.cpuPercent, heapPercent: sample.heapPercent, queueDepth: sample.queueDepth, activeWorkers: sample.activeWorkers, eventLoopDelayMs: sample.eventLoopDelayMs }, source: 'local-runtime-telemetry', externalProviderRequired: false };
}

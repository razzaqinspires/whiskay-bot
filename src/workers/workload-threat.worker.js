import { parentPort } from 'node:worker_threads';
import { analyzeThreatSnapshot } from '../core/ThreatIntelligence.js';

if (!parentPort) throw new Error('Workload threat worker requires a parent port.');
parentPort.on('message', message => {
  const id = message?.id;
  try {
    const result = analyzeThreatSnapshot(message?.snapshot || {});
    parentPort.postMessage({ id, ok: true, result });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: String(error?.message || error).slice(0, 300) });
  }
});

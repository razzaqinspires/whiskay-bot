import { processNextoraRepairQueue } from '../services/nextora-repair/NextoraRepairService.js';

export default {
  name: 'nextora-repair-worker',
  intervalMs: 30000,
  initialDelayMs: 15000,
  enabled: process.env.NEXTORA_REPAIR_WORKER_ENABLED !== 'false',
  async run() {
    return processNextoraRepairQueue();
  }
};

import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

/** Bounded worker_threads pool for CPU-isolated, local threat feature analysis. */
export class ThreatWorkerPool {
  constructor({
    size = Number(process.env.WHISKAY_THREAT_WORKERS || 2),
    maxQueue = Number(process.env.WHISKAY_THREAT_QUEUE_MAX || 20),
    timeoutMs = Number(process.env.WHISKAY_THREAT_JOB_TIMEOUT_MS || 5000),
    workerURL = new URL('../workers/workload-threat.worker.js', import.meta.url),
    WorkerClass = Worker,
  } = {}) {
    this.size = clamp(size, 1, 4);
    this.maxQueue = clamp(maxQueue, 1, 100);
    this.timeoutMs = clamp(timeoutMs, 250, 30000);
    this.workerURL = workerURL;
    this.WorkerClass = WorkerClass;
    this.slots = [];
    this.queue = [];
    this.closed = false;
    this.started = false;
    this.statsData = { submitted: 0, completed: 0, failed: 0, rejected: 0, workerRestarts: 0 };
  }

  #spawn(index) {
    if (this.closed) return;
    const worker = new this.WorkerClass(this.workerURL, { type: 'module' });
    const slot = { index, worker, job: null, restarting: false };
    this.slots[index] = slot;
    worker.on('message', message => {
      const job = slot.job;
      if (!job || message?.id !== job.id) return;
      clearTimeout(job.timer);
      slot.job = null;
      if (message.ok) { this.statsData.completed++; job.resolve(message.result); }
      else { this.statsData.failed++; job.reject(new Error(message.error || 'Threat worker failed.')); }
      this.#pump();
    });
    worker.on('error', error => this.#replace(slot, error));
    worker.on('exit', code => {
      if (!this.closed && !slot.restarting) this.#replace(slot, new Error(`Threat worker exited (${code}).`));
    });
    return slot;
  }

  #replace(slot, error) {
    if (this.closed || slot.restarting) return;
    slot.restarting = true;
    if (slot.job) {
      clearTimeout(slot.job.timer);
      this.statsData.failed++;
      slot.job.reject(error);
      slot.job = null;
    }
    this.statsData.workerRestarts++;
    slot.worker.terminate().catch(() => {});
    this.#spawn(slot.index);
    this.#pump();
  }

  #ensureStarted() {
    if (this.started) return;
    this.started = true;
    for (let index = 0; index < this.size; index++) this.#spawn(index);
  }

  run(snapshot) {
    if (this.closed) return Promise.reject(new Error('Threat worker pool is closed.'));
    if (this.queue.length >= this.maxQueue) {
      this.statsData.rejected++;
      return Promise.reject(Object.assign(new Error('Threat analysis queue is full.'), { code: 'WHISKAY_THREAT_QUEUE_FULL' }));
    }
    this.#ensureStarted();
    return new Promise((resolve, reject) => {
      const job = { id: randomUUID(), snapshot, resolve, reject, timer: null, queuedAt: Date.now() };
      this.queue.push(job);
      this.statsData.submitted++;
      this.#pump();
    });
  }

  #pump() {
    if (this.closed) return;
    for (const slot of this.slots) {
      if (!slot || slot.job || !this.queue.length) continue;
      const job = this.queue.shift();
      slot.job = job;
      job.timer = setTimeout(() => this.#replace(slot, new Error('Threat worker timed out.')), this.timeoutMs);
      job.timer.unref?.();
      slot.worker.postMessage({ id: job.id, snapshot: job.snapshot });
    }
  }

  stats() {
    return {
      started: this.started,
      closed: this.closed,
      size: this.size,
      active: this.slots.filter(slot => slot?.job).length,
      queueDepth: this.queue.length,
      maxQueue: this.maxQueue,
      ...this.statsData,
    };
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const job of this.queue.splice(0)) job.reject(new Error('Threat worker pool closed.'));
    await Promise.all(this.slots.filter(Boolean).map(async slot => {
      if (slot.job) {
        clearTimeout(slot.job.timer);
        slot.job.reject(new Error('Threat worker pool closed.'));
        slot.job = null;
      }
      await slot.worker.terminate().catch(() => {});
    }));
    this.slots = [];
  }
}

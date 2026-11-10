import { publishChronosSnapshot } from './RuntimeCortex.js';

/** In-process scheduler with single-flight ticks and bounded parallel execution. */
export class ChronosCortex {
  constructor({ concurrency = 2, now = () => Date.now() } = {}) {
    this.jobs = new Map(); this.running = new Map();
    this.concurrency = Math.max(1, Math.min(8, Number(concurrency) || 2)); this.now = now;
    this.metrics = { ticks: 0, success: 0, failed: 0, skipped: 0, lastTickAt: 0, lastError: null };
    this.timer = null; this.tickPromise = null; this.stopping = false; this.paused = false;
  }
  register(job) {
    if (!job || !/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(String(job.name || '')) || typeof job.run !== 'function') throw new TypeError('Job requires safe name and run function');
    const intervalMs = Number(job.intervalMs);
    if (!Number.isFinite(intervalMs) || intervalMs < 1000 || intervalMs > 365 * 86400000) throw new RangeError('intervalMs must be between 1s and 365d');
    if (this.jobs.has(job.name)) throw new Error(`Duplicate job: ${job.name}`);
    this.jobs.set(job.name, { ...job, intervalMs, nextAt: this.now() + (job.initialDelayMs === undefined ? intervalMs : Math.max(0, Number(job.initialDelayMs) || 0)), enabled: job.enabled !== false });
    return this.jobs.get(job.name);
  }
  unregister(name) { const job = this.jobs.get(name); if (!job || this.running.has(name)) return false; return this.jobs.delete(name); }
  status() {
    const snapshot = { registered: this.jobs.size, running: this.running.size, concurrency: this.concurrency, stopping: this.stopping, paused: this.paused, ...this.metrics,
      jobs: [...this.jobs.values()].map(j => ({ name: j.name, enabled: j.enabled, intervalMs: j.intervalMs, nextAt: j.nextAt, lastRunAt: j.lastRunAt || null, lastDurationMs: j.lastDurationMs ?? null, lastStatus: j.lastStatus || 'pending' })) };
    publishChronosSnapshot(snapshot); return snapshot;
  }
  async tick() {
    if (this.stopping || this.paused) return this.status();
    if (this.tickPromise) return this.tickPromise;
    const promise = this.#runTick(); this.tickPromise = promise;
    try { return await promise; } finally { if (this.tickPromise === promise) this.tickPromise = null; }
  }
  async #runTick() {
    const now = this.now(); this.metrics.ticks++; this.metrics.lastTickAt = now;
    const due = [...this.jobs.values()].filter(j => j.enabled && j.nextAt <= now && !this.running.has(j.name)).sort((a, b) => a.nextAt - b.nextAt);
    const available = Math.max(0, this.concurrency - this.running.size);
    const selected = due.slice(0, available);
    this.metrics.skipped += Math.max(0, due.length - selected.length);
    await Promise.all(selected.map(job => this.#execute(job, now)));
    return this.status();
  }
  async #execute(job, scheduledAt) {
    job.nextAt = scheduledAt + job.intervalMs;
    const started = this.now();
    // Defer job invocation one microtask so the running map is populated first.
    const task = Promise.resolve().then(() => job.run({ now: scheduledAt, jobName: job.name })).then(() => {
      job.lastStatus = 'success'; this.metrics.success++;
    }).catch(error => {
      job.lastStatus = 'failed'; this.metrics.failed++;
      this.metrics.lastError = { job: job.name, message: String(error?.message || error).slice(0, 200), at: this.now() };
    }).finally(() => {
      job.lastRunAt = started; job.lastDurationMs = Math.max(0, this.now() - started); this.running.delete(job.name);
    });
    this.running.set(job.name, task);
    await task;
  }
  start() {
    if (this.timer || this.stopping) return false;
    this.paused = false; this.timer = setInterval(() => { this.tick().catch(() => {}); }, 1000); this.timer.unref?.(); return true;
  }
  async pause({ wait = true, timeoutMs = 5000 } = {}) {
    this.paused = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (wait) {
      let timer;
      const active = Promise.allSettled([...(this.running.values()), ...(this.tickPromise ? [this.tickPromise] : [])]);
      await Promise.race([active, new Promise(resolve => { timer = setTimeout(resolve, Math.max(0, timeoutMs)); })]);
      clearTimeout(timer);
    }
    return this.status();
  }
  async stop({ wait = true, timeoutMs = 5000 } = {}) { this.stopping = true; return this.pause({ wait, timeoutMs }); }
  resume() { if (this.stopping) return false; this.paused = false; return this.start(); }
}
export default ChronosCortex;

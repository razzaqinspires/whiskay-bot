/** Bounded, fair scheduler for outbound/network jobs.
 * Shutdown is deterministic: queued and pacing-wait jobs are cancelled promptly,
 * and waitForIdle() includes the pump itself as well as active job promises.
 */
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
const abortError = signal => signal?.reason || new Error('Job aborted');

export class WorkloadScheduler {
  constructor({ concurrency = 3, perLaneConcurrency = 1, minIntervalMs = 1200, maxQueue = 500, now = () => Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
    this.concurrency = clamp(concurrency, 1, 16);
    this.perLaneConcurrency = clamp(perLaneConcurrency, 1, 4);
    this.minIntervalMs = clamp(minIntervalMs, 0, 60000);
    this.maxQueue = clamp(maxQueue, 1, 10000);
    this.now = now; this.sleep = sleep;
    this.lanes = new Map(); this.active = 0; this.lastStartedAt = 0;
    this.paused = false; this.closed = false; this.sequence = 0;
    this.pumping = false; this.pendingStarts = new Set(); this.idleWaiters = [];
    this.statsData = { accepted: 0, completed: 0, failed: 0, rejected: 0, cancelled: 0 };
  }

  enqueue({ lane = 'default', kind = 'network', run, signal, metadata = null } = {}) {
    if (typeof run !== 'function') return Promise.reject(new TypeError('Job run must be a function'));
    if (this.closed) { this.statsData.rejected++; return Promise.reject(new Error('Scheduler closed')); }
    if (this.queueDepth + this.pendingStarts.size >= this.maxQueue) { this.statsData.rejected++; return Promise.reject(new Error('Workload queue is full')); }
    if (signal?.aborted) { this.statsData.cancelled++; return Promise.reject(abortError(signal)); }
    const key = String(lane || 'default');
    let q = this.lanes.get(key); if (!q) { q = { items: [], active: 0 }; this.lanes.set(key, q); }
    const job = { id: ++this.sequence, run, kind, signal, metadata, queuedAt: this.now(), lane: key, state: 'queued', wakeWait: null, abortListener: null };
    const promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; q.items.push(job); });
    if (signal) {
      job.abortListener = () => {
        const index = q.items.indexOf(job); if (index >= 0) q.items.splice(index, 1);
        this.#cancel(job, abortError(signal)); this.#pruneLane(key, q); this.#pump(); this.#notifyIdle();
      };
      signal.addEventListener('abort', job.abortListener, { once: true });
    }
    this.statsData.accepted++; this.#pump(); return promise;
  }

  get queueDepth() { let n = 0; for (const q of this.lanes.values()) n += q.items.length; return n; }
  pause() { this.paused = true; return this.stats(); }
  resume() { if (!this.closed) { this.paused = false; this.#pump(); } return this.stats(); }

  async close({ cancelPending = true, waitForActive = false, timeoutMs = 5000 } = {}) {
    this.closed = true;
    if (cancelPending) {
      for (const [name, q] of this.lanes) {
        for (const job of q.items.splice(0)) this.#cancel(job, new Error('Scheduler closed'));
        this.#pruneLane(name, q);
      }
      for (const job of [...this.pendingStarts]) this.#cancel(job, new Error('Scheduler closed'));
    }
    this.#notifyIdle();
    if (waitForActive) await this.waitForIdle({ timeoutMs });
    return this.stats();
  }

  async waitForIdle({ timeoutMs = 5000 } = {}) {
    if (this.#isIdle()) return true;
    return new Promise(resolve => {
      let settled = false;
      const finish = value => { if (settled) return; settled = true; clearTimeout(timer); this.idleWaiters = this.idleWaiters.filter(x => x !== finish); resolve(value); };
      const timer = setTimeout(() => finish(false), Math.max(0, timeoutMs));
      this.idleWaiters.push(finish);
    });
  }

  #isIdle() { return !this.pumping && !this.active && !this.pendingStarts.size && !this.queueDepth; }
  #pruneLane(name, q) { if (q && !q.items.length && !q.active && ![...this.pendingStarts].some(j => j.lane === name)) this.lanes.delete(name); }
  #removeAbortListener(job) { if (job.signal && job.abortListener) job.signal.removeEventListener('abort', job.abortListener); job.abortListener = null; }

  #cancel(job, error) {
    if (!job || job.state === 'settled' || job.state === 'running') return false;
    job.state = 'settled'; this.pendingStarts.delete(job);
    job.wakeWait?.(); job.wakeWait = null; this.#removeAbortListener(job);
    this.statsData.cancelled++; job.reject(error); this.#pruneLane(job.lane, this.lanes.get(job.lane));
    return true;
  }

  #notifyIdle() {
    if (!this.#isIdle()) return;
    for (const finish of [...this.idleWaiters]) finish(true);
  }

  stats() {
    return { paused: this.paused, closed: this.closed, concurrency: this.concurrency, active: this.active,
      queueDepth: this.queueDepth, pendingStarts: this.pendingStarts.size, pumping: this.pumping,
      lanes: [...this.lanes].map(([name, q]) => ({ name, active: q.active, queued: q.items.length })), ...this.statsData };
  }

  async #pump() {
    if (this.pumping || this.paused || this.closed) return;
    this.pumping = true;
    try {
      while (!this.paused && !this.closed && this.active + this.pendingStarts.size < this.concurrency) {
        let chosen = null;
        for (const [name, q] of this.lanes) {
          const pendingForLane = [...this.pendingStarts].filter(j => j.lane === name).length;
          if (q.items.length && q.active + pendingForLane < this.perLaneConcurrency) { chosen = { name, q }; break; }
        }
        if (!chosen) break;
        const job = chosen.q.items.shift();
        if (job.signal?.aborted) { this.#cancel(job, abortError(job.signal)); this.#pruneLane(chosen.name, chosen.q); continue; }
        job.state = 'waiting-slot'; this.pendingStarts.add(job);
        const wait = Math.max(0, this.minIntervalMs - (this.now() - this.lastStartedAt));
        if (wait) {
          let wake;
          const cancelled = new Promise(resolve => { wake = resolve; });
          job.wakeWait = wake;
          try { await Promise.race([Promise.resolve().then(() => this.sleep(wait)), cancelled]); }
          catch (error) { this.#cancel(job, error); continue; }
          finally { job.wakeWait = null; }
        }
        if (job.state === 'settled') { this.#pruneLane(chosen.name, chosen.q); continue; }
        if (this.closed || this.paused || job.signal?.aborted) {
          this.#cancel(job, this.closed ? new Error('Scheduler closed') : job.signal?.aborted ? abortError(job.signal) : new Error('Scheduler paused'));
          this.#pruneLane(chosen.name, chosen.q); continue;
        }
        this.pendingStarts.delete(job); job.state = 'running'; this.#removeAbortListener(job);
        this.lastStartedAt = this.now(); this.active++; chosen.q.active++;
        this.#execute(chosen.name, chosen.q, job);
      }
    } finally { this.pumping = false; this.#notifyIdle(); }
  }

  async #execute(lane, q, job) {
    try {
      if (job.signal?.aborted) throw abortError(job.signal);
      const result = await job.run({ id: job.id, lane, kind: job.kind, metadata: job.metadata, signal: job.signal, queuedMs: Math.max(0, this.now() - job.queuedAt) });
      this.statsData.completed++; job.resolve(result);
    } catch (error) { this.statsData.failed++; job.reject(error); }
    finally {
      job.state = 'settled'; this.active--; q.active--; this.#removeAbortListener(job);
      this.#pruneLane(lane, q); this.#pump(); this.#notifyIdle();
    }
  }
}

export const workloadScheduler = new WorkloadScheduler({
  concurrency: process.env.WHISKAY_WORKER_CONCURRENCY || 3,
  perLaneConcurrency: process.env.WHISKAY_WORKER_LANE_CONCURRENCY || 1,
  minIntervalMs: process.env.WHISKAY_WORKER_MIN_INTERVAL_MS || 1200,
  maxQueue: process.env.WHISKAY_WORKER_MAX_QUEUE || 500
});

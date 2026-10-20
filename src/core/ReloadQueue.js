import Logger from './Logger.js';

/**
 * Serialized reload queue with coalescing.
 * - Only one reload runs at a time
 * - Requests during in-flight → coalesce into single follow-up
 * - Failure backoff to prevent runaway loops
 */
export class ReloadQueue {
  constructor(handler, { name = 'queue', backoffMs = 5000, failureThreshold = 3 } = {}) {
    if (typeof handler !== 'function') throw new TypeError('handler must be function');
    this.handler = handler;
    this.name = name;
    this.backoffMs = backoffMs;
    this.failureThreshold = failureThreshold;

    this._running = false;
    this._pending = false;
    this._inflight = null;
    this._consecutiveFailures = 0;
    this._stats = { runs: 0, ok: 0, fail: 0, coalesced: 0, lastDuration: 0, lastReason: null };
  }

  get stats() { return { ...this._stats }; }
  get busy() { return this._running; }

  async push(reason = 'manual') {
    // Already running → coalesce
    if (this._running) {
      this._pending = true;
      this._stats.coalesced++;
      Logger.debug(`[${this.name}] coalesced (${reason})`);
      return this._inflight;
    }

    this._running = true;
    this._inflight = (async () => {
      try {
        return await this._runOnce(reason);
      } finally {
        this._running = false;
        // Schedule follow-up if pending
        if (this._pending) {
          this._pending = false;
          queueMicrotask(() => this.push('coalesced-follow-up'));
        }
      }
    })();

    return this._inflight;
  }

  async _runOnce(reason) {
    const t0 = Date.now();
    this._stats.runs++;
    this._stats.lastReason = reason;

    try {
      const result = await this.handler(reason);
      this._stats.ok++;
      this._stats.lastDuration = Date.now() - t0;
      this._consecutiveFailures = 0;
      Logger.info(`[${this.name}] ✓ reload OK (${reason}) ${this._stats.lastDuration}ms`);
      return result;
    } catch (err) {
      this._stats.fail++;
      this._consecutiveFailures++;
      Logger.error(`[${this.name}] ✗ reload FAILED (${reason}): ${err.message}`);

      // Backoff after repeated failures
      if (this._consecutiveFailures >= this.failureThreshold) {
        Logger.warn(`[${this.name}] ${this._consecutiveFailures} failures → backoff ${this.backoffMs}ms`);
        await new Promise(r => setTimeout(r, this.backoffMs));
      }
      throw err;
    }
  }
}

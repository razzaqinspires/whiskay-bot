import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import Logger from './Logger.js';

export const DEFAULT_BAK_PATTERNS = [
  /\.bak$/i, /\.bak\.\d+$/i, /\.tmp$/i, /\.temp$/i,
  /\.swp$/i, /\.swo$/i, /\.orig$/i, /\.old$/i, /\.copy$/i,
  /~$/, /\.save$/i
];

export const DEFAULT_IGNORE = [
  /node_modules/,
  /[\\/]\.git[\\/]/,
  /[\\/]sessions[\\/]/,
  /[\\/]\.cache[\\/]/,
  /\.zip$/i, /\.tar\.gz$/i
];

function fmtBytes(b) {
  if (!b) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export class AutoCleaner {
  constructor({
    paths = ['.'],
    patterns = DEFAULT_BAK_PATTERNS,
    ignore = DEFAULT_IGNORE,
    intervalMs = 300_000,
    onEvent = null,
    dryRun = false
  } = {}) {
    this.paths = paths;
    this.patterns = patterns;
    this.ignore = ignore;
    this.intervalMs = intervalMs;
    this.onEvent = onEvent;
    this.dryRun = dryRun;

    this._timer = null;
    this._running = false;
    this._stats = {
      scans: 0,
      deleted: 0,
      bytesFreed: 0,
      lastRun: null,
      lastDuration: 0,
      lastReason: null,
      lastDeleted: [],
      lastError: null
    };
  }

  get stats() {
    return {
      ...this._stats,
      bytesFreedHuman: fmtBytes(this._stats.bytesFreed),
      active: Boolean(this._timer),
      busy: this._running,
      intervalMs: this.intervalMs,
      paths: this.paths
    };
  }
  get active() { return Boolean(this._timer); }
  get busy() { return this._running; }

  start() {
    if (this._timer) return this;
    this._timer = setInterval(() => {
      this.runOnce({ reason: 'interval' }).catch(e =>
        Logger.warn(`AutoCleaner: ${e.message}`)
      );
    }, this.intervalMs);
    if (this._timer.unref) this._timer.unref();
    Logger.info(`🧹 AutoCleaner: ON (interval ${Math.round(this.intervalMs / 1000)}s)`);
    return this;
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
      Logger.info('🧹 AutoCleaner: OFF');
    }
    return this;
  }

  setInterval(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n < 5_000) return false;
    this.intervalMs = n;
    if (this._timer) { this.stop(); this.start(); }
    return true;
  }

  async runOnce({ reason = 'manual', dryRun = this.dryRun } = {}) {
    if (this._running) return { skipped: true, reason: 'busy' };
    this._running = true;
    const t0 = Date.now();
    const deleted = [];
    let bytes = 0;
    let err = null;

    try {
      for (const p of this.paths) {
        const abs = path.resolve(p);
        let files = [];
        try { files = await this._scan(abs); } catch (e) { err = e.message; }

        for (const f of files) {
          try {
            const st = await stat(f);
            if (!dryRun) await unlink(f);
            bytes += st.size;
            deleted.push({ file: path.relative(process.cwd(), f), size: st.size });
          } catch (e) {
            Logger.debug(`Clean skip ${f}: ${e.message}`);
          }
        }
      }

      this._stats.scans++;
      this._stats.deleted += deleted.length;
      this._stats.bytesFreed += bytes;
      this._stats.lastRun = new Date().toISOString();
      this._stats.lastDuration = Date.now() - t0;
      this._stats.lastReason = reason;
      this._stats.lastDeleted = deleted.slice(0, 50);
      this._stats.lastError = err;

      if (deleted.length && !dryRun) {
        Logger.info(
          `🧹 AutoCleaner: ${deleted.length} file(s), ${fmtBytes(bytes)} freed (${this._stats.lastDuration}ms)`
        );
        for (const d of deleted.slice(0, 5)) Logger.debug(`   • ${d.file} (${d.size}B)`);
      }

      try {
        this.onEvent?.({
          kind: 'autoclean',
          reason,
          dryRun,
          count: deleted.length,
          bytes,
          duration: this._stats.lastDuration,
          files: deleted.slice(0, 15).map(d => d.file)
        });
      } catch {}

      return { deleted, bytes, duration: this._stats.lastDuration, dryRun };
    } finally {
      this._running = false;
    }
  }

  async preview() {
    const found = [];
    for (const p of this.paths) {
      const abs = path.resolve(p);
      try { found.push(...await this._scan(abs)); } catch {}
    }
    const out = [];
    for (const f of found) {
      try {
        const st = await stat(f);
        out.push({ file: path.relative(process.cwd(), f), size: st.size });
      } catch {}
    }
    return out;
  }

  async _scan(dir) {
    const out = [];
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }

    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (this.ignore.some(rx => rx.test(full))) continue;
      if (e.isDirectory()) {
        out.push(...await this._scan(full));
      } else if (e.isFile() && this._matches(e.name)) {
        out.push(full);
      }
    }
    return out;
  }

  _matches(name) {
    return this.patterns.some(rx => rx.test(name));
  }
}

export { fmtBytes };

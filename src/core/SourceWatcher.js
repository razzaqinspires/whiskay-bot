import chokidar from 'chokidar';
import path from 'node:path';
import Logger from './Logger.js';

const IGNORE_EXT = /\.(json|jsonl|log|db|sqlite|sqlite3|bak|tmp|swp|swo|orig|old|map|lock)$/i;
const IGNORE_DIR = /(node_modules|\.git|sessions|\.cache|coverage|dist|build)[\\/]/;

/**
 * Watches core source files (src/**.js, except src/plugins/**).
 * On change → syntax-check → auto-restart via RestartManager.
 *
 * Separate from PluginWatcher (which does in-place plugin swap).
 */
export class SourceWatcher {
  constructor({ dir, ignore = [], onReload, onEvent, debounceMs = 800 } = {}) {
    this.dir = dir;
    this.ignore = ignore;
    this.onReload = onReload;
    this.onEvent = onEvent;
    this.debounceMs = debounceMs;
    this._watcher = null;
    this._timer = null;
    this._changes = new Set();
    this._startedAt = null;
    this._totalEvents = 0;
  }

  start() {
    if (this._watcher) return this;
    this._startedAt = Date.now();

    this._watcher = chokidar.watch(this.dir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      ignored: [
        ...this.ignore,
        (p) => IGNORE_DIR.test(p) || IGNORE_EXT.test(p)
      ]
    });

    const push = (kind, full) => {
      const rel = path.relative(this.dir, full);
      this._changes.add(`${kind}:${rel}`);
      this._totalEvents++;
      try { this.onEvent?.(kind, rel); }
      catch (e) { Logger.warn(`SourceWatcher onEvent: ${e.message}`); }
      this._schedule();
    };

    this._watcher.on('ready', () =>
      Logger.info(`👁️  Source watcher active: ${this.dir}`)
    );
    this._watcher.on('add',    p => push('add', p));
    this._watcher.on('change', p => push('change', p));
    this._watcher.on('unlink', p => push('unlink', p));
    this._watcher.on('error',  e => Logger.warn(`SourceWatcher: ${e.message}`));

    return this;
  }

  _schedule() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(async () => {
      const batch = [...this._changes];
      this._changes.clear();
      this._timer = null;
      if (!batch.length) return;
      Logger.info(`📁 Source: ${batch.length} change(s)`);
      for (const c of batch.slice(0, 8)) Logger.info(`   • ${c}`);
      try { await this.onReload?.(batch); }
      catch (e) { Logger.error(`SourceWatcher onReload: ${e.message}`); }
    }, this.debounceMs);
  }

  get stats() {
    return {
      active: Boolean(this._watcher),
      startedAt: this._startedAt,
      totalEvents: this._totalEvents,
      uptimeMs: this._startedAt ? Date.now() - this._startedAt : 0,
      dir: this.dir,
      debounceMs: this.debounceMs
    };
  }

  async stop() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this._watcher) { await this._watcher.close(); this._watcher = null; }
  }
}

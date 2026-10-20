import chokidar from 'chokidar';
import path from 'node:path';
import Logger from './Logger.js';

/**
 * Watches plugin dir, debounces changes, fires onReload once per batch.
 */
export class PluginWatcher {
  constructor(dir, { onReload, debounceMs = 500, ignoreInitial = true } = {}) {
    this.dir = dir;
    this.onReload = onReload;
    this.debounceMs = debounceMs;
    this.ignoreInitial = ignoreInitial;

    this._watcher = null;
    this._timer = null;
    this._changes = new Set();
    this._ready = false;
  }

  start() {
    if (this._watcher) return this;

    this._watcher = chokidar.watch(this.dir, {
      ignoreInitial: this.ignoreInitial,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
      ignored: [/(^|[\/\\])\../, /node_modules/]
    });

    const push = (kind, full) => {
      const rel = path.relative(this.dir, full);
      this._changes.add(`${kind}:${rel}`);
      this._schedule();
    };

    this._watcher.on('ready', () => {
      this._ready = true;
      Logger.info(`👁️  Watcher active: ${this.dir}`);
    });
    this._watcher.on('add',     p => push('add', p));
    this._watcher.on('change',  p => push('change', p));
    this._watcher.on('unlink',  p => push('unlink', p));
    this._watcher.on('error',   e => Logger.warn(`Watcher error: ${e.message}`));

    return this;
  }

  _schedule() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      const batch = [...this._changes];
      this._changes.clear();
      this._timer = null;
      if (!batch.length) return;
      Logger.info(`📁 Detected ${batch.length} change(s):`);
      for (const c of batch.slice(0, 8)) Logger.info(`   • ${c}`);
      if (batch.length > 8) Logger.info(`   … +${batch.length - 8} more`);
      try { this.onReload?.(batch); } catch (e) { Logger.error(`onReload: ${e.message}`); }
    }, this.debounceMs);
  }

  async stop() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this._watcher) { await this._watcher.close(); this._watcher = null; }
    this._ready = false;
  }
}

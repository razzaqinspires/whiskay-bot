import chokidar from 'chokidar';
import path from 'node:path';
import Logger from './Logger.js';

const IGNORE_DIR = /(^|[\\/])(node_modules|\.git|sessions|\.cache|coverage|dist|build)([\\/]|$)/i;
const PLUGIN_DIR = /(^|[\\/])plugins([\\/]|$)/i;

/** Only JavaScript source under the configured source root is eligible. */
export function isWatchedJavaScript(relativePath) {
  const normalized = String(relativePath || '').replaceAll('\\', '/').replace(/^\/+/, '');
  if (!normalized || normalized.startsWith('../') || normalized.includes('/../')) return false;
  if (normalized.startsWith('lib/external/')) return false;
  if (!normalized.toLowerCase().endsWith('.js')) return false;
  if (PLUGIN_DIR.test(normalized)) return false;
  if (IGNORE_DIR.test(normalized)) return false;
  return true;
}

function mergeKind(previous, next) {
  if (!previous) return next;
  if (previous === 'add' && next === 'change') return 'add';
  if (previous === 'add' && next === 'unlink') return null;
  if (previous === 'unlink' && next === 'add') return 'change';
  return next;
}

/**
 * Universal JavaScript source watcher. It detects .js changes across src/**
 * except plugins (which retain PluginWatcher). Runtime source changes are
 * planned conservatively; arbitrary ESM modules are not live-swapped here.
 */
export class SourceWatcher {
  constructor({ dir, ignore = [], onReload, onEvent, debounceMs = 800, watcherFactory = chokidar.watch } = {}) {
    this.dir = path.resolve(dir || 'src');
    this.ignore = ignore;
    this.onReload = onReload;
    this.onEvent = onEvent;
    this.debounceMs = debounceMs;
    this.watcherFactory = watcherFactory;
    this._watcher = null;
    this._timer = null;
    this._changes = new Map();
    this._startedAt = null;
    this._totalEvents = 0;
    this._lastBatchAt = null;
  }

  start() {
    if (this._watcher) return this;
    this._startedAt = Date.now();
    this._watcher = this.watcherFactory(this.dir, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      ignored: (filePath, stats) => {
        const relative = path.relative(this.dir, filePath).replaceAll('\\', '/');
        if (this.ignore.some(rule => rule instanceof RegExp ? rule.test(filePath) || rule.test(relative) : filePath.includes(String(rule)))) return true;
        if (IGNORE_DIR.test(relative)) return true;
        if (stats?.isDirectory?.()) return false;
        return !isWatchedJavaScript(relative);
      }
    });

    const push = (kind, fullPath) => {
      const absolute = path.resolve(fullPath);
      const relative = path.relative(this.dir, absolute).replaceAll('\\', '/');
      if (!isWatchedJavaScript(relative)) return;
      const previous = this._changes.get(relative);
      const merged = mergeKind(previous, kind);
      if (merged) this._changes.set(relative, merged);
      else this._changes.delete(relative);
      this._totalEvents++;
      try { this.onEvent?.(kind, relative); }
      catch (error) { Logger.warn(`SourceWatcher onEvent: ${error.message}`); }
      this._schedule();
    };

    this._watcher.on('ready', () => Logger.info(`Universal JS watcher active: ${this.dir}`));
    this._watcher.on('add', file => push('add', file));
    this._watcher.on('change', file => push('change', file));
    this._watcher.on('unlink', file => push('unlink', file));
    this._watcher.on('error', error => Logger.warn(`SourceWatcher: ${error.message}`));
    return this;
  }

  _schedule() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(async () => {
      const batch = [...this._changes].map(([file, kind]) => ({ file, kind }));
      this._changes.clear();
      this._timer = null;
      if (!batch.length) return;
      this._lastBatchAt = Date.now();
      Logger.info(`Universal JS source: ${batch.length} change(s)`);
      for (const item of batch.slice(0, 8)) Logger.info(`  ${item.kind}: ${item.file}`);
      try { await this.onReload?.(batch); }
      catch (error) { Logger.error(`SourceWatcher onReload: ${error.message}`); }
    }, this.debounceMs);
    this._timer.unref?.();
  }

  get stats() {
    return {
      active: Boolean(this._watcher), startedAt: this._startedAt,
      totalEvents: this._totalEvents, uptimeMs: this._startedAt ? Date.now() - this._startedAt : 0,
      dir: this.dir, debounceMs: this.debounceMs, pendingFiles: this._changes.size,
      lastBatchAt: this._lastBatchAt, scope: 'javascript-only', excludes: ['src/plugins/**', 'src/lib/external/**']
    };
  }

  async stop() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this._changes.clear();
    if (this._watcher) { await this._watcher.close(); this._watcher = null; }
  }
}

export default SourceWatcher;

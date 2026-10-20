import Logger from './Logger.js';

/**
 * Tracks uncaught errors and prevents infinite crash loops.
 * - Errors are logged, process keeps running
 * - If N errors occur within windowMs → triggers onFatal (usually exit)
 */
export class CrashGuard {
  constructor({ maxCrashes = 5, windowMs = 60_000, onFatal = null } = {}) {
    this.max = maxCrashes;
    this.windowMs = windowMs;
    this.onFatal = onFatal;
    this._crashes = [];
    this._installed = false;
  }

  install() {
    if (this._installed) return this;
    this._installed = true;

    process.on('uncaughtException', err => this._handle('uncaughtException', err));
    process.on('unhandledRejection', err => this._handle('unhandledRejection', err));

    Logger.info(`🛡️  CrashGuard installed (max ${this.max}/${this.windowMs}ms)`);
    return this;
  }

  _handle(kind, err) {
    const msg = err?.message || String(err);
    const stackTop = (err?.stack || '').split('\n').slice(0, 4).join('\n');
    Logger.error(`[${kind}] ${msg}\n${stackTop}`);

    const now = Date.now();
    this._crashes.push(now);
    while (this._crashes.length && this._crashes[0] < now - this.windowMs) this._crashes.shift();

    if (this._crashes.length >= this.max) {
      Logger.fatal(`🚨 Crash loop: ${this._crashes.length} errors within ${this.windowMs}ms`);
      if (typeof this.onFatal === 'function') {
        try { this.onFatal(err); } catch {}
      }
      process.exit(1);
    }
  }
}

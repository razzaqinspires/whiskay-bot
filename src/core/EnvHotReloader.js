import chokidar from 'chokidar';
import { reloadConfigFromEnvFile, getEnvFilePath } from '../config/index.js';
import { RESTART_REQUIRED_KEYS } from '../config/settings.js';
import Logger from './Logger.js';

export class EnvHotReloader {
  constructor({ debounceMs = Number(process.env.ENV_RELOAD_DEBOUNCE_MS || 650) } = {}) {
    this.debounceMs = Math.max(150, Math.min(10000, debounceMs));
    this.watcher = null;
    this.timer = null;
    this.running = null;
    this.started = false;
  }

  start() {
    if (this.started || String(process.env.ENV_RELOAD_ENABLED || 'true').toLowerCase() === 'false') return this;
    this.started = true;
    const file = getEnvFilePath();
    this.watcher = chokidar.watch(file, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 350, pollInterval: 100 } });
    const schedule = event => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.reload(event), this.debounceMs);
      this.timer.unref?.();
    };
    this.watcher.on('change', () => schedule('change'));
    this.watcher.on('add', () => schedule('add'));
    this.watcher.on('error', error => Logger.warn({ err: error.message }, '.env watcher error'));
    Logger.info({ file, debounceMs: this.debounceMs }, '.env hot-reload watcher ready');
    return this;
  }

  async reload(reason = 'manual') {
    if (this.running) return this.running;
    this.running = (async () => {
      try {
        const result = await reloadConfigFromEnvFile();
        const keys = result.changedKeys;
        if (!keys.length) return { changed: false, keys: [] };
        const restartRequired = keys.filter(key => RESTART_REQUIRED_KEYS.has(key));
        Logger.info({ changed: keys, restartRequired }, '.env reloaded without replacing the bot process');
        return { changed: true, keys, restartRequired };
      } catch (error) {
        Logger.error({ err: error.message, reason }, '.env hot-reload failed; keeping current runtime config');
        return { changed: false, error: error.message };
      }
    })().finally(() => { this.running = null; });
    return this.running;
  }

  async stop() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.watcher) await this.watcher.close();
    this.watcher = null;
    this.started = false;
  }
}

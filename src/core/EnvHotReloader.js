import chokidar from 'chokidar';
import { reloadConfigFromEnvFile, getEnvFilePath } from '../config/index.js';
import { RESTART_REQUIRED_KEYS, ENV_SETTING_MAP } from '../config/settings.js';
import { synchronizeEnvTemplate, resolveTemplatePath } from '../config/EnvTemplateSynchronizer.js';
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
    const envFile = getEnvFilePath();
    const templateFile = resolveTemplatePath();
    this.watcher = chokidar.watch([envFile, templateFile], {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
      atomic: true
    });
    const schedule = event => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.reload(event), this.debounceMs);
      this.timer.unref?.();
    };
    this.watcher.on('change', file => schedule(`change:${file}`));
    this.watcher.on('add', file => schedule(`add:${file}`));
    this.watcher.on('unlink', file => schedule(`unlink:${file}`));
    this.watcher.on('error', error => Logger.warn({ err: error.message }, '.env watcher error'));
    Logger.info({ envFile, templateFile, debounceMs: this.debounceMs }, '.env + .env.example live synchronizer ready');
    return this;
  }

  async reload(reason = 'manual') {
    if (this.running) return this.running;
    this.running = (async () => {
      try {
        const sync = await synchronizeEnvTemplate();
        const result = await reloadConfigFromEnvFile({ removedKeys: sync.removedKeys });
        const keys = result.changedKeys;
        if (!keys.length && !sync.changed) return { changed: false, keys: [], sync };
        const restartRequired = keys.filter(key => RESTART_REQUIRED_KEYS.has(key) || !ENV_SETTING_MAP.has(key));
        const hotReloaded = keys.filter(key => ENV_SETTING_MAP.get(key)?.hotReloadable === true);
        Logger.info({ added: sync.addedKeys, removed: sync.removedKeys, changed: keys, hotReloaded, restartRequired }, '.env configuration reconciled and refreshed');
        return { changed: true, keys, hotReloaded, restartRequired, sync };
      } catch (error) {
        Logger.error({ err: error.message, reason }, '.env hot-reload failed; current runtime configuration retained');
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

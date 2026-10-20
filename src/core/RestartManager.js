import { spawn, spawnSync } from 'node:child_process';
import Logger from './Logger.js';

/**
 * Detects supervisor and performs restart accordingly.
 *  - pm2      → process.exit(0), PM2 auto-restarts
 *  - systemd  → process.exit(0), unit Restart=always
 *  - standalone → spawn detached child + exit old
 */
export function detectSupervisor() {
  if (process.env.PM2_HOME || process.env.pm_id) return 'pm2';
  if (process.env.INVOCATION_ID) return 'systemd';
  return 'standalone';
}

/** Run `node --check` on each file. Returns { ok, errors[] }. */
export function syntaxCheck(files = []) {
  const errors = [];
  for (const f of files) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    if (r.status !== 0) {
      errors.push({ file: f, error: (r.stderr || '').trim().split('\n').slice(0, 3).join('\n') });
    }
  }
  return { ok: errors.length === 0, errors };
}

export class RestartManager {
  constructor({ onBeforeRestart = null, delayMs = 1000, spawnDelayMs = 400 } = {}) {
    this.supervisor = detectSupervisor();
    this.onBeforeRestart = onBeforeRestart;
    this.delayMs = delayMs;
    this.spawnDelayMs = spawnDelayMs;
    this._restarting = false;
    this._shuttingDown = false;
    this._history = [];
  }

  get stats() {
    return {
      supervisor: this.supervisor,
      restarting: this._restarting,
      shuttingDown: this._shuttingDown,
      history: this._history.slice(-5),
      total: this._history.length
    };
  }

  markShutdown() { this._shuttingDown = true; }

  async restart({ reason = 'manual', files = [] } = {}) {
    if (this._shuttingDown) {
      Logger.warn(`Restart ignored (shutdown in progress): ${reason}`);
      return { ok: false, reason: 'shutting-down' };
    }
    if (this._restarting) {
      Logger.warn(`Restart ignored (already restarting): ${reason}`);
      return { ok: false, reason: 'already-restarting' };
    }

    // Syntax preflight — jangan restart kalau ada error
    const check = syntaxCheck(files);
    if (!check.ok) {
      Logger.error('❌ Syntax error detected — restart aborted');
      for (const e of check.errors) Logger.error(`   ${e.file}: ${e.error}`);
      return { ok: false, reason: 'syntax-error', errors: check.errors };
    }

    this._restarting = true;
    const info = {
      t: new Date().toISOString(),
      reason,
      files: files.slice(0, 10),
      supervisor: this.supervisor
    };
    this._history.push(info);

    Logger.warn(`♻️  Restarting (reason: ${reason}) via ${this.supervisor}`);

    // Graceful: stop socket, watchers, etc.
    try { await this.onBeforeRestart?.(info); }
    catch (e) { Logger.warn(`onBeforeRestart: ${e.message}`); }

    await new Promise(r => setTimeout(r, this.delayMs));

    if (this.supervisor === 'pm2' || this.supervisor === 'systemd') {
      Logger.warn('→ exit(0) — supervisor will handle restart');
      process.exit(0);
    }

    // Standalone: spawn detached child with same argv
    try {
      const args = process.argv.slice(1);
      const child = spawn(process.execPath, args, {
        cwd: process.cwd(),
        detached: true,
        stdio: 'inherit',
        env: {
          ...process.env,
          WHISKAY_RESPAWNED: '1',
          WHISKAY_RESTART_REASON: reason
        }
      });
      child.unref();
      Logger.warn(`→ spawned child pid=${child.pid}, old exiting`);

      await new Promise(r => setTimeout(r, this.spawnDelayMs));
      process.exit(0);
    } catch (e) {
      Logger.error(`Spawn failed: ${e.message}`);
      this._restarting = false;
      return { ok: false, reason: 'spawn-failed', error: e.message };
    }
  }
}

import os from 'node:os';
import { statSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import config from '../../config/index.js';
import { registry } from '../../core/registry.js';

const START = Date.now();

function fmtBytes(b) {
  if (!b || b < 0) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(' ');
}

function safeStat(p) {
  try { if (!existsSync(p)) return null; return statSync(p); } catch { return null; }
}

function dirSize(dir) {
  let total = 0;
  const walk = (p) => {
    let entries;
    try { entries = readdirSync(p, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(p, e.name);
      try {
        if (e.isDirectory()) walk(full);
        else total += statSync(full).size;
      } catch {}
    }
  };
  walk(dir);
  return total;
}

const yn = v => v ? '✅ ON' : '❌ OFF';
const or = (v, d = '-') => (v === undefined || v === null || v === '' ? d : v);

export default {
  name: 'info',
  command: 'info',
  aliases: ['status', 'sysinfo'],
  category: 'tools',
  cooldown: 3000,
  description: 'Runtime + toggle status',
  async execute(ctx) {
    const mem = process.memoryUsage();
    const procUptime = process.uptime() * 1000;

    // ─── Safe references ───
    const watcher = registry.watcher || null;
    const cleaner = registry.autoCleaner || null;
    const sourceW = registry.sourceWatcher || null;
    const restartMgr = registry.restartManager || null;
    const queue = registry.reloadQueue || null;
    const log = registry.watcherLog || null;
    const state = registry.runtimeState || null;

    // ─── Safe stats ───
    let ws = {};
    try { ws = (watcher && typeof watcher.stats === 'object' && watcher.stats) || {}; } catch { ws = {}; }
    let cs = {};
    let ss = {};
    try { cs = (cleaner && typeof cleaner.stats === 'object' && cleaner.stats) || {}; } catch { cs = {}; }
    try { ss = (sourceW && typeof sourceW.stats === 'object' && sourceW.stats) || {}; } catch { ss = {}; }
    const qs = (queue && queue.stats) || {};

    // ─── Persisted flags ───
    let watchPersisted = null, cleanPersisted = null, sourcePersisted = null;
    try { watchPersisted = state?.get?.('watchPlugins', null) ?? null; } catch {}
    try { cleanPersisted = state?.get?.('autoClean', null) ?? null; } catch {}
    try { sourcePersisted = state?.get?.('sourceReload', null) ?? null; } catch {}

    // ─── Plugins ───
    const pluginMap = registry.plugins?.plugins || new Map();
    const commandMap = registry.plugins?.commands || new Map();
    const categories = new Set();
    for (const p of pluginMap.values()) categories.add(p?.category || 'general');

    // ─── Log summary ───
    let logSummary = { total: 0, files: 0 };
    try { if (log && typeof log.summary === 'function') logSummary = log.summary(); } catch {}

    // ─── File sizes ───
    const sessDir = config.sessionDir || './sessions';
    const logFile = path.join(sessDir, 'watcher-log.jsonl');
    const runtimeFile = path.join(sessDir, 'runtime.json');
    const logStat = safeStat(logFile);
    const runtimeStat = safeStat(runtimeFile);

    const cpuLoad = typeof os.loadavg === 'function' ? os.loadavg()[0] : 0;
    const cpuCount = (os.cpus?.() || []).length || 1;

    // ─── Build output ───
    const L = [];
    L.push('╭─「 *ℹ️  SYSTEM INFO* 」');
    L.push('│');
    L.push('│ 🖥️  *Runtime*');
    L.push(`│   Bot      : ${config.botName}`);
    L.push(`│   Node     : ${process.version}`);
    L.push(`│   Platform : ${os.platform()} ${os.arch()}`);
    L.push(`│   CPU      : ${cpuCount} core • ${cpuLoad.toFixed(2)} load`);
    L.push(`│   Uptime   : ${fmtUptime(procUptime)}`);
    L.push(`│   PID      : ${process.pid}`);
    L.push('│');

    L.push('│ 💾 *Memory*');
    L.push(`│   Heap     : ${fmtBytes(mem.heapUsed)} / ${fmtBytes(mem.heapTotal)}`);
    L.push(`│   RSS      : ${fmtBytes(mem.rss)}`);
    L.push(`│   External : ${fmtBytes(mem.external)}`);
    L.push('│');

    L.push('│ 🎛️  *Runtime Toggles*');
    L.push(`│   Hot Reload  : ${yn(Boolean(watcher))}${watchPersisted !== null ? ` (persist: ${watchPersisted ? 'ON' : 'OFF'})` : ''}`);
    if (watcher) {
      L.push(`│     Events    : ${or(ws.totalEvents, 0)} captured`);
      L.push(`│     Ready     : ${ws.ready ? 'Yes' : 'No'}`);
    }
    L.push(`│   Auto Clean  : ${yn(Boolean(cleaner?.active))}${cleanPersisted !== null ? ` (persist: ${cleanPersisted ? 'ON' : 'OFF'})` : ''}`);
    if (cleaner) {
      L.push(`│     Interval  : ${Math.round((cleaner.intervalMs || 0) / 1000)}s`);
      L.push(`│     Sweeps    : ${or(cs.scans, 0)} run(s)`);
      L.push(`│     Deleted   : ${or(cs.deleted, 0)} file(s)`);
      L.push(`│     Freed     : ${or(cs.bytesFreedHuman, '0 B')}`);
    }
    L.push(`│   Source Reload: ${yn(Boolean(sourceW))}${sourcePersisted !== null ? ` (persist: ${sourcePersisted ? 'ON' : 'OFF'})` : ''}`);
    if (sourceW) {
      L.push(`│     Events    : ${or(ss.totalEvents, 0)}`);
      L.push(`│     Supervisor: ${or(restartMgr?.supervisor, '-')}`);
    }
    L.push('│');

    L.push('│ 🔁 *Reload Queue*');
    L.push(`│   Busy      : ${queue?.busy ? 'Yes' : 'No'}`);
    L.push(`│   Runs      : ${or(qs.runs, 0)}`);
    L.push(`│   OK / Fail : ${or(qs.ok, 0)} / ${or(qs.fail, 0)}`);
    L.push(`│   Coalesced : ${or(qs.coalesced, 0)}`);
    L.push(`│   Last dur  : ${or(qs.lastDuration, 0)}ms`);
    L.push('│');

    L.push('│ 📜 *Watcher Log*');
    L.push(`│   Entries  : ${or(logSummary.total, 0)}`);
    L.push(`│   Files    : ${or(logSummary.files, 0)} tracked`);
    L.push(`│   Log size : ${logStat ? fmtBytes(logStat.size) : 'empty'}`);
    L.push(`│   Runtime  : ${runtimeStat ? fmtBytes(runtimeStat.size) : 'empty'}`);
    L.push('│');

    L.push('│ 📦 *Plugins*');
    L.push(`│   Plugins    : ${pluginMap.size}`);
    L.push(`│   Commands   : ${commandMap.size}`);
    L.push(`│   Categories : ${categories.size} (${[...categories].join(', ') || '-'})`);
    L.push('│');

    L.push('│ ⚙️  *Config*');
    L.push(`│   Prefixes : ${config.prefixes.join(' ')}`);
    L.push(`│   Owners   : ${config.owners.length} number(s)`);
    L.push(`│   Log Level: ${config.logLevel}`);
    L.push('│');

    L.push('│ 🗂️  *Storage*');
    L.push(`│   Sessions : ${fmtBytes(dirSize(sessDir))}`);
    L.push(`│   CWD      : ${process.cwd()}`);
    L.push('│');
    L.push('╰────────────────────────');

    await ctx.reply(L.join('\n'));
  }
};

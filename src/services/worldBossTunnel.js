import { EventEmitter } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateEnvFileValues } from '../lib/env-file.js';

const events = new EventEmitter();
events.setMaxListeners(20);
const PORT = Math.max(1024, Math.min(65535, Number(process.env.WHISKAY_BOT_WEBHOOK_PORT || 8787)));
const ENDPOINT = '/webhooks/world-boss';
const RETRY_BASE_MS = Math.max(1000, Number(process.env.WHISKAY_TUNNEL_RETRY_MS || 3000));
const RETRY_MAX_MS = Math.max(RETRY_BASE_MS, Number(process.env.WHISKAY_TUNNEL_RETRY_MAX_MS || 30000));
const START_TIMEOUT_MS = Math.max(5000, Number(process.env.WHISKAY_TUNNEL_START_TIMEOUT_MS || 20000));
const RPG_DIR = path.resolve(process.env.WHISKAY_RPG_PROJECT_DIR || '../whiskay-rpg-companion');
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = '.runtime/whiskay-tunnel.json';

let child = null;
let url = '';
let mode = 'stopped';
let startedAt = 0;
let persistedAt = 0;
let persistError = '';
let lastError = '';
let retryCount = 0;
let retryTimer = null;
let stopping = false;
let startPromise = null;
let restartPromise = null;

function emitState(event) {
  const payload = getWorldBossTunnelStatus();
  events.emit(event, payload);
  events.emit('state', payload);
}
export function onWorldBossTunnel(event, listener) {
  events.on(event, listener);
  return () => events.off(event, listener);
}
export function getWorldBossTunnelStatus() {
  return {
    enabled: String(process.env.WHISKAY_WEBHOOK_TUNNEL_ENABLED || 'true').toLowerCase() !== 'false',
    mode, url, endpoint: url ? `${url}${ENDPOINT}` : '',
    port: PORT, pid: child?.pid || null, retryCount, lastError,
    startedAt: startedAt || null, persistedAt: persistedAt || null,
    envSaved: Boolean(persistedAt), persistError
  };
}

function absoluteCandidate(candidate) {
  if (!candidate || candidate === 'cloudflared') return candidate;
  return path.isAbsolute(candidate) ? candidate : path.resolve(ROOT_DIR, candidate);
}

function isRunnable(file) {
  try {
    const candidate = absoluteCandidate(file);
    if (candidate.includes(path.sep)) {
      if (!existsSync(candidate) || !statSync(candidate).isFile()) return false;
    }
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: 3500, env: process.env });
    return !result.error && result.status === 0;
  } catch { return false; }
}

// Always resolve bundled paths from the repository root, not the shell's cwd.
// A stale configured path is skipped; spawn errors also clear the child reference
// so the bounded retry worker can make a fresh attempt instead of reusing a dead child.
export function resolveCloudflaredExecutable() {
  const archMap = { x64: 'amd64', arm64: 'arm64', arm: 'arm' };
  const filename = `cloudflared-linux-${archMap[process.arch] || process.arch}`;
  const configuredRaw = String(process.env.CLOUDFLARED_BIN || '').trim();
  const configured = configuredRaw ? absoluteCandidate(configuredRaw) : '';
  const configuredBinDir = String(process.env.JADIBOT_BIN_DIR || './data/bin').trim();
  const binDir = path.isAbsolute(configuredBinDir) ? configuredBinDir : path.resolve(ROOT_DIR, configuredBinDir);
  const candidates = [
    ...(configured ? [configured] : []),
    path.join(binDir, filename),
    path.join(ROOT_DIR, 'bin', filename),
    'cloudflared'
  ];
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    if (isRunnable(candidate)) return candidate === 'cloudflared' ? candidate : absoluteCandidate(candidate);
    if (candidate === configured && configured) {
      console.warn(`[world-boss-tunnel] CLOUDFLARED_BIN tidak valid/tidak dapat dieksekusi: ${configured}; mencoba fallback.`);
    }
  }
  throw new Error(`cloudflared tidak ditemukan untuk linux/${process.arch}. Letakkan ${filename} di ${binDir} atau ${path.join(ROOT_DIR, 'bin', filename)}, instal cloudflared ke PATH, atau atur CLOUDFLARED_BIN ke binary yang valid.`);
}


async function syncGitHubManifest(manifest) {
  if (String(process.env.WHISKAY_TUNNEL_GITHUB_SYNC || 'false').toLowerCase() === 'false') return;
  const token = String(process.env.WHISKAY_GITHUB_SYNC_TOKEN || '').trim();
  if (!token) { console.warn('[world-boss-tunnel] GitHub sync dilewati: WHISKAY_GITHUB_SYNC_TOKEN belum diatur.'); return; }
  const repos = [
    String(process.env.WHISKAY_GITHUB_REPO || 'razzaqinspires/whiskay-bot').trim(),
    String(process.env.WHISKAY_RPG_GITHUB_REPO || 'razzaqinspires/whiskay-rpg-companion').trim()
  ].filter((value, i, all) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) && all.indexOf(value) === i);
  for (const repo of repos) {
    try {
      const filePath = MANIFEST;
      const headers = {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'Whiskay-AutoTunnel'
      };
      const api = `https://api.github.com/repos/${repo}/contents/${filePath}`;
      let sha;
      const existing = await fetch(api, { headers, signal: AbortSignal.timeout(8000) });
      if (existing.ok) sha = (await existing.json()).sha;
      else if (existing.status !== 404) throw new Error(`GitHub read HTTP ${existing.status}`);
      const body = {
        message: 'chore(runtime): sync temporary Whiskay webhook tunnel URL',
        content: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`).toString('base64'),
        ...(sha ? { sha } : {})
      };
      const response = await fetch(api, {
        method: 'PUT', headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error(`GitHub write HTTP ${response.status}`);
      console.log(`[world-boss-tunnel] Manifest GitHub diperbarui: ${repo}/${filePath}`);
    } catch (error) {
      console.warn(`[world-boss-tunnel] GitHub sync gagal untuk ${repo}: ${error.message}`);
    }
  }
}

async function persistUrl() {
  if (!url) return;
  const endpoint = `${url}${ENDPOINT}`;
  const entries = {
    WHISKAY_BOT_WEBHOOK_URL: endpoint,
    WHISKAY_BOT_WEBHOOK_PUBLIC_URL: url
  };
  const botEnv = process.env.ENV_FILE
    ? path.resolve(process.env.ENV_FILE)
    : path.join(ROOT_DIR, '.env');
  await updateEnvFileValues(botEnv, entries);

  // Optional companion env update is best-effort; the bot's own env is authoritative.
  const rpgEnv = path.join(RPG_DIR, '.env');
  try { await updateEnvFileValues(rpgEnv, { WHISKAY_BOT_WEBHOOK_URL: endpoint }); }
  catch (error) { console.warn(`[world-boss-tunnel] .env RPG tidak diperbarui (${rpgEnv}): ${error.message}`); }

  const manifest = {
    service: 'whiskay-world-boss-webhook',
    baseUrl: url,
    webhookUrl: endpoint,
    path: ENDPOINT,
    port: PORT,
    envFile: path.relative(ROOT_DIR, botEnv) || '.env',
    generatedAt: new Date().toISOString(),
    note: 'Temporary TryCloudflare URL; do not put secrets in this file. URL may change after restart.'
  };
  const localManifest = path.join(ROOT_DIR, MANIFEST);
  try {
    await mkdir(path.dirname(localManifest), { recursive: true });
    await writeFile(localManifest, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  } catch (error) { console.warn(`[world-boss-tunnel] Manifest lokal gagal ditulis: ${error.message}`); }
  await syncGitHubManifest(manifest);
  persistedAt = Date.now();
  persistError = '';
  emitState('url');
  console.log(`[world-boss-tunnel] URL TryCloudflare tersimpan otomatis ke ${botEnv}`);
  console.log(`[world-boss-tunnel] Base URL : ${url}`);
  console.log(`[world-boss-tunnel] Webhook  : ${endpoint}`);
}

function scheduleRetry() {
  if (stopping || retryTimer || String(process.env.WHISKAY_WEBHOOK_TUNNEL_ENABLED || 'true').toLowerCase() === 'false') return;
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** Math.min(retryCount, 4)));
  retryCount++;
  mode = 'retry-wait';
  emitState('retry');
  retryTimer = setTimeout(() => {
    retryTimer = null;
    launchTunnel().catch(error => {
      lastError = error.message;
      mode = 'error';
      emitState('error');
      scheduleRetry();
    });
  }, delay);
  retryTimer.unref?.();
}

function launchTunnel() {
  if (stopping) return Promise.resolve('');
  if (child && child.exitCode === null) return Promise.resolve(url);
  const executable = resolveCloudflaredExecutable();
  mode = 'starting'; url = ''; lastError = '';
  emitState('starting');
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    try {
      child = spawn(executable, ['tunnel', '--url', `http://127.0.0.1:${PORT}`, '--no-autoupdate'], {
        stdio: ['ignore', 'pipe', 'pipe'], env: process.env
      });
    } catch (error) {
      mode = 'error'; lastError = error.message; emitState('error'); finish('', error); return;
    }
    const currentChild = child;
    let persistenceStarted = false;
    const inspect = chunk => {
      const text = String(chunk || '');
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && !persistenceStarted) {
        persistenceStarted = true;
        url = match[0].replace(/\/+$/, '');
        mode = 'persisting-env'; startedAt = Date.now(); retryCount = 0;
        emitState('persisting');
        persistUrl().then(() => {
          mode = 'connected';
          console.log(`[world-boss-tunnel] Tunnel aktif dan URL tersimpan: ${url}${ENDPOINT}`);
          emitState('connected');
          finish(url);
        }).catch(error => {
          persistError = error.message;
          lastError = `Tunnel aktif, tetapi .env gagal diperbarui: ${error.message}`;
          mode = 'connected-env-warning';
          console.warn(`[world-boss-tunnel] ${lastError}`);
          console.warn(`[world-boss-tunnel] Salin manual: WHISKAY_BOT_WEBHOOK_URL=${url}${ENDPOINT}`);
          emitState('error');
          finish(url);
        });
      }
      if (/failed to start|authentication error|failed to create quick tunnel/i.test(text)) {
        lastError = text.trim().slice(-500);
      }
    };
    child.stdout?.on('data', inspect);
    child.stderr?.on('data', inspect);
    child.on('error', error => {
      if (child === currentChild) child = null;
      lastError = error.message;
      mode = 'error';
      emitState('error');
      finish('', error);
      if (!stopping) scheduleRetry();
    });
    child.on('exit', code => {
      const unexpected = !stopping;
      if (child === currentChild) child = null;
      url = '';
      if (unexpected) {
        mode = 'disconnected';
        lastError ||= `cloudflared keluar dengan kode ${code}`;
        emitState('disconnected');
        scheduleRetry();
      } else mode = 'stopped';
      finish('');
    });
    const timer = setTimeout(() => {
      lastError = 'URL Quick Tunnel belum muncul dalam batas waktu startup';
      finish('');
      if (child && child.exitCode === null) {
        // Keep the process alive for late registration; a future exit triggers retry.
        mode = 'waiting-url';
        emitState('waiting-url');
      }
    }, START_TIMEOUT_MS);
  });
}

export async function startWorldBossTunnel() {
  if (String(process.env.WHISKAY_WEBHOOK_TUNNEL_ENABLED || 'true').toLowerCase() === 'false') {
    mode = 'disabled'; emitState('disabled'); return getWorldBossTunnelStatus();
  }
  if (startPromise) return startPromise;
  stopping = false;
  startPromise = (async () => {
    try { await launchTunnel(); }
    catch (error) {
      lastError = error.message; mode = 'error'; emitState('error');
      console.warn(`[world-boss-tunnel] Startup gagal; background retry akan dilakukan: ${error.message}`);
      scheduleRetry();
    }
    return getWorldBossTunnelStatus();
  })().finally(() => { startPromise = null; });
  return startPromise;
}

export async function restartWorldBossTunnel() {
  if (restartPromise) return restartPromise;
  restartPromise = (async () => {
    stopping = true;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    const old = child;
    child = null; url = '';
    if (old && old.exitCode === null) {
      await new Promise(resolve => {
        const timeout = setTimeout(() => { try { old.kill('SIGKILL'); } catch {} resolve(); }, 3000);
        old.once('exit', () => { clearTimeout(timeout); resolve(); });
        try { old.kill('SIGTERM'); } catch { clearTimeout(timeout); resolve(); }
      });
    }
    stopping = false;
    retryCount = 0;
    await startWorldBossTunnel();
    return getWorldBossTunnelStatus();
  })().finally(() => { restartPromise = null; });
  return restartPromise;
}

export async function stopWorldBossTunnel() {
  stopping = true;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  const old = child;
  child = null; url = '';
  if (old && old.exitCode === null) {
    await new Promise(resolve => {
      const timeout = setTimeout(() => { try { old.kill('SIGKILL'); } catch {} resolve(); }, 3000);
      old.once('exit', () => { clearTimeout(timeout); resolve(); });
      try { old.kill('SIGTERM'); } catch { clearTimeout(timeout); resolve(); }
    });
  }
  mode = 'stopped'; emitState('stopped');
}

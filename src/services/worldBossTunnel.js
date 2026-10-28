import { EventEmitter } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const events = new EventEmitter();
events.setMaxListeners(20);
const PORT = Math.max(1024, Math.min(65535, Number(process.env.WHISKAY_BOT_WEBHOOK_PORT || 8787)));
const ENDPOINT = '/webhooks/world-boss';
const RETRY_BASE_MS = Math.max(1000, Number(process.env.WHISKAY_TUNNEL_RETRY_MS || 3000));
const RETRY_MAX_MS = Math.max(RETRY_BASE_MS, Number(process.env.WHISKAY_TUNNEL_RETRY_MAX_MS || 30000));
const START_TIMEOUT_MS = Math.max(5000, Number(process.env.WHISKAY_TUNNEL_START_TIMEOUT_MS || 20000));
const RPG_DIR = path.resolve(process.env.WHISKAY_RPG_PROJECT_DIR || '../whiskay-rpg-companion');
const ROOT_DIR = process.cwd();
const MANIFEST = '.runtime/whiskay-tunnel.json';

let child = null;
let url = '';
let mode = 'stopped';
let startedAt = 0;
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
    startedAt: startedAt || null
  };
}

function getExecutable() {
  const configured = String(process.env.CLOUDFLARED_BIN || '').trim();
  if (configured) return configured;
  const archMap = { x64: 'amd64', arm64: 'arm64', arm: 'arm' };
  const bundled = path.resolve(process.env.JADIBOT_BIN_DIR || './data/bin', `cloudflared-linux-${archMap[process.arch] || process.arch}`);
  try { accessSync(bundled); return bundled; } catch {}
  const check = spawnSync('cloudflared', ['--version'], { encoding: 'utf8', timeout: 3000 });
  if (!check.error && check.status === 0) return 'cloudflared';
  throw new Error('cloudflared tidak ditemukan. Instal cloudflared atau atur CLOUDFLARED_BIN.');
}
function accessSync(file) {
  // spawnSync avoids relying on shell PATH lookup APIs and also validates executable presence.
  try {
    const result = spawnSync(file, ['--version'], { encoding: 'utf8', timeout: 2500 });
    return !result.error && result.status === 0;
  } catch { return false; }
}

async function updateEnvFile(file, entries) {
  await mkdir(path.dirname(file), { recursive: true });
  let source = '';
  try { source = await readFile(file, 'utf8'); } catch {}
  const lines = source ? source.split(/\r?\n/) : [];
  for (const [key, value] of Object.entries(entries)) {
    const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const line = `${key}="${escaped}"`;
    const matcher = new RegExp(`^\\s*(?:export\\s+)?${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
    const idx = lines.findIndex(row => matcher.test(row));
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
    process.env[key] = String(value);
  }
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, `${lines.filter((v, i, a) => i < a.length - 1 || v !== '').join('\n').replace(/\n*$/, '\n')}`, { mode: 0o600 });
  await rename(tmp, file);
}

async function syncGitHubManifest(manifest) {
  if (String(process.env.WHISKAY_TUNNEL_GITHUB_SYNC || 'true').toLowerCase() === 'false') return;
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
  const botEnv = path.join(ROOT_DIR, '.env');
  const rpgEnv = path.join(RPG_DIR, '.env');
  try { await updateEnvFile(botEnv, entries); }
  catch (error) { console.warn(`[world-boss-tunnel] Tidak bisa memperbarui .env bot: ${error.message}`); }
  try { await updateEnvFile(rpgEnv, { WHISKAY_BOT_WEBHOOK_URL: endpoint }); }
  catch (error) { console.warn(`[world-boss-tunnel] Tidak bisa memperbarui .env RPG (${rpgEnv}): ${error.message}`); }

  const manifest = {
    service: 'whiskay-world-boss-webhook',
    baseUrl: url,
    webhookUrl: endpoint,
    path: ENDPOINT,
    port: PORT,
    generatedAt: new Date().toISOString(),
    note: 'Temporary TryCloudflare URL; do not put secrets in this file. URL may change after restart.'
  };
  const localManifest = path.join(ROOT_DIR, MANIFEST);
  try {
    await mkdir(path.dirname(localManifest), { recursive: true });
    await writeFile(localManifest, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
  } catch (error) { console.warn(`[world-boss-tunnel] Manifest lokal gagal ditulis: ${error.message}`); }
  const rpgManifest = path.join(RPG_DIR, MANIFEST);
  try {
    await mkdir(path.dirname(rpgManifest), { recursive: true });
    await writeFile(rpgManifest, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
  } catch (error) { console.warn(`[world-boss-tunnel] Manifest RPG gagal ditulis: ${error.message}`); }
  await syncGitHubManifest(manifest);
  emitState('url');
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
  const executable = getExecutable();
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
    const inspect = chunk => {
      const text = String(chunk || '');
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && !url) {
        url = match[0].replace(/\/+$/, '');
        mode = 'connected'; startedAt = Date.now(); retryCount = 0;
        persistUrl().catch(error => console.warn('[world-boss-tunnel] Persist URL gagal:', error.message));
        console.log(`[world-boss-tunnel] Webhook tunnel aktif: ${url}${ENDPOINT}`);
        emitState('connected');
        finish(url);
      }
      if (/failed to start|authentication error|failed to create quick tunnel/i.test(text)) {
        lastError = text.trim().slice(-500);
      }
    };
    child.stdout?.on('data', inspect);
    child.stderr?.on('data', inspect);
    child.on('error', error => {
      lastError = error.message; mode = 'error'; emitState('error'); finish('', error);
    });
    child.on('exit', code => {
      const unexpected = !stopping;
      child = null; url = '';
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

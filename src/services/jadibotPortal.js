import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { access, chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createWriteStream, accessSync, readFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(process.env.JADIBOT_DATA_DIR || './data/jadibot');
const TICKETS_FILE = path.join(ROOT, 'pairing-tickets.json');
const PORT = Math.max(1024, Math.min(65535, Number(process.env.JADIBOT_PORT || process.env.PORT || 8791)));
const HOST = process.env.JADIBOT_HOST || '0.0.0.0';
const TICKET_TTL_MS = 10 * 60 * 1000;
let server = null;
let tunnel = null;
let tunnelUrl = '';
let publicBaseUrl = '';
let portalMode = 'not-started';
let botNumberProvider = () => String(process.env.BOT_WHATSAPP_NUMBER || process.env.PAIRING_NUMBER || '').replace(/\D/g, '');
let ticketWrites = Promise.resolve();
let cleanupTimer = null;
let stopRequested = false;
const submitAttempts = new Map();
const SUBMIT_WINDOW_MS = 10 * 60 * 1000;
const SUBMIT_LIMIT = 8;

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, max-age=0', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'" });
  res.end(JSON.stringify(body));
};
const pageHeaders = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store, max-age=0',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
};
const normPhone = value => String(value || '').replace(/[\s()+.-]/g, '').replace(/\D/g, '');
/** In-memory per-IP throttle for the public submit endpoint. No IPs are persisted or logged. */
export function checkPairingSubmitRateLimit(key, now = Date.now()) {
  const k = String(key || 'unknown').slice(0, 120);
  const recent = (submitAttempts.get(k) || []).filter(ts => now - ts < SUBMIT_WINDOW_MS);
  if (recent.length >= SUBMIT_LIMIT) {
    submitAttempts.set(k, recent);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((SUBMIT_WINDOW_MS - (now - recent[0])) / 1000)) };
  }
  recent.push(now);
  submitAttempts.set(k, recent);
  if (submitAttempts.size > 5000) {
    for (const [ip, times] of submitAttempts) {
      const valid = times.filter(ts => now - ts < SUBMIT_WINDOW_MS);
      if (!valid.length) submitAttempts.delete(ip); else submitAttempts.set(ip, valid);
    }
  }
  return { allowed: true, remaining: SUBMIT_LIMIT - recent.length };
}
export function resetPairingSubmitRateLimitsForTests() { submitAttempts.clear(); }
export function isValidPairingPhone(value) {
  const p = normPhone(value);
  return /^\d{8,15}$/.test(p) && !p.startsWith('0');
}
function normalizeBase(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    if (!['https:', 'http:'].includes(u.protocol)) return '';
    return u.origin;
  } catch { return ''; }
}
function publicUrlFromEnv() {
  const explicit = normalizeBase(process.env.JADIBOT_PUBLIC_URL || process.env.JADIBOT_PORTAL_URL);
  if (explicit) return explicit;
  const candidates = [
    process.env.RAILWAY_PUBLIC_DOMAIN,
    process.env.RENDER_EXTERNAL_URL,
    process.env.FLY_APP_NAME ? `${process.env.FLY_APP_NAME}.fly.dev` : '',
    process.env.KOYEB_PUBLIC_DOMAIN,
    process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ? `${process.env.CODESPACE_NAME}-${PORT}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}` : '',
    process.env.VERCEL_URL,
    (process.env.REPLIT_DOMAINS || '').split(',')[0].trim()
  ].filter(Boolean);
  for (const value of candidates) {
    const base = normalizeBase(value);
    if (base) return base;
  }
  if (process.env.VERCEL === '1' && process.env.VERCEL_URL) return normalizeBase(process.env.VERCEL_URL);
  return '';
}
export function detectPortalMode(env = process.env) {
  const override = String(env.JADIBOT_TUNNEL || 'auto').toLowerCase();
  if (override === 'off') return 'external-required';
  if (override === 'on') return 'trycloudflare';
  const candidates = [env.JADIBOT_PUBLIC_URL, env.JADIBOT_PORTAL_URL];
  if (candidates.some(v => String(v || '').trim())) return 'public-url';
  const platformKeys = ['VERCEL', 'RAILWAY_ENVIRONMENT', 'RAILWAY_PROJECT_ID', 'RENDER', 'FLY_APP_NAME', 'DYNO', 'KOYEB_SERVICE_ID', 'K_SERVICE', 'FUNCTIONS_WORKER_RUNTIME', 'KUBERNETES_SERVICE_HOST', 'CODESPACE_NAME', 'GITHUB_ACTIONS', 'PORT'];
  if (platformKeys.some(k => String(env[k] || '').trim())) return 'external-required';
  if (String(env.SSH_CONNECTION || env.SSH_CLIENT || '').trim()) return 'external-required';
  try { accessSyncDocker(); return 'external-required'; } catch {}
  try {
    const vendor = readFileSyncVendor();
    if (/amazon|google|microsoft|digitalocean|hetzner|ovh|linode|vultr|upcloud|oracle|alibaba|scaleway|contabo/i.test(vendor)) return 'external-required';
  } catch {}
  return override === 'off' ? 'external-required' : 'trycloudflare';
}
// Synchronous checks are deliberately tiny and best-effort; no shell command is executed.
function accessSyncDocker() { accessSync('/.dockerenv'); }
function readFileSyncVendor() { return readFileSync('/sys/class/dmi/id/sys_vendor', 'utf8'); }

async function readTickets() {
  try { const d = JSON.parse(await readFile(TICKETS_FILE, 'utf8')); return d && typeof d === 'object' ? d : {}; }
  catch { return {}; }
}
async function mutateTickets(mutator) {
  const run = ticketWrites.then(async () => {
    await mkdir(ROOT, { recursive: true, mode: 0o700 });
    const data = await readTickets();
    const result = await mutator(data);
    const tmp = `${TICKETS_FILE}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(tmp, TICKETS_FILE);
    await chmod(TICKETS_FILE, 0o600).catch(() => {});
    return result;
  });
  ticketWrites = run.catch(() => {});
  return run;
}
function cleanExpired(data, now = Date.now()) {
  for (const [id, ticket] of Object.entries(data)) if (!ticket || Number(ticket.expiresAt) <= now || ticket.used) delete data[id];
}
export async function createPairingTicket({ userJid, userKey }) {
  const id = randomBytes(24).toString('hex');
  const now = Date.now();
  return mutateTickets(db => {
    cleanExpired(db, now);
    // Keep one active ticket per user so old CTA links cannot trigger multiple logins.
    for (const [oldId, row] of Object.entries(db)) if (row.userKey === String(userKey)) delete db[oldId];
    db[id] = { userJid: String(userJid || ''), userKey: String(userKey || ''), createdAt: now, expiresAt: now + TICKET_TTL_MS, phone: '', submittedAt: 0, used: false };
    return { id, expiresAt: db[id].expiresAt };
  });
}
export async function getPairingTicket(id) {
  if (!/^[a-f0-9]{48}$/.test(String(id || ''))) return null;
  await ticketWrites.catch(() => {});
  const db = await readTickets();
  const row = db[id];
  if (!row || row.used || row.expiresAt <= Date.now()) return null;
  return { ...row };
}
export async function submitPairingPhone(id, phone) {
  const clean = normPhone(phone);
  if (!isValidPairingPhone(clean)) return { ok: false, error: 'Nomor harus berupa kode negara + angka, contoh 628123456789.' };
  const botNumber = normPhone(await botNumberProvider());
  if (!/^\d{8,15}$/.test(botNumber)) return { ok: false, error: 'Nomor bot belum terdeteksi. Atur BOT_WHATSAPP_NUMBER lalu mulai ulang bot.' };
  return mutateTickets(db => {
    const row = db[id];
    if (!row || row.used || row.expiresAt <= Date.now()) return { ok: false, error: 'Link kedaluwarsa atau sudah digunakan. Kembali ke bot dan buat link baru.' };
    if (row.submittedAt) return { ok: false, error: 'Nomor sudah dikirim. Selesaikan konfirmasi WhatsApp atau buat link baru.' };
    row.phone = clean;
    row.submittedAt = Date.now();
    db[id] = row;
    const message = `.jadibotconfirm ${id}`;
    return { ok: true, whatsappUrl: `https://wa.me/${botNumber}?text=${encodeURIComponent(message)}`, expiresAt: row.expiresAt };
  });
}
export async function consumePairingTicket(id, userKey) {
  return mutateTickets(db => {
    const row = db[id];
    if (!row || row.used || row.expiresAt <= Date.now() || !row.submittedAt || !row.phone) return { ok: false, error: 'Permintaan pairing tidak ditemukan, belum diisi, sudah digunakan, atau kedaluwarsa.' };
    if (row.userKey !== String(userKey || '')) return { ok: false, error: 'Konfirmasi harus dikirim oleh akun WhatsApp yang meminta link ini.' };
    const ticket = { ...row };
    row.used = true;
    row.usedAt = Date.now();
    row.phone = ''; // Do not retain the submitted phone after successful ticket consumption.
    db[id] = row;
    ticket.used = true;
    ticket.usedAt = row.usedAt;
    return { ok: true, ticket };
  });
}
export function setBotNumberProvider(fn) { if (typeof fn === 'function') botNumberProvider = fn; }
export function getPortalBaseUrl() { return publicBaseUrl; }
export function getPortalMode() { return portalMode; }
export async function waitForPortalUrl(timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (publicBaseUrl) return publicBaseUrl;
    if (portalMode === 'external-required') return '';
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return publicBaseUrl;
}

const HTML = ticket => `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>WHISKAY · Pairing Portal</title>
<style>
:root{color-scheme:dark;--bg:#080d17;--panel:#101a2b;--line:#27364e;--muted:#94a7c2;--text:#edf4ff;--accent:#9af0d0;--accent2:#bde9ff}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(900px 500px at 15% 0%,#162b43 0%,transparent 60%),radial-gradient(700px 420px at 100% 100%,#17302f 0%,transparent 65%),var(--bg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--text);display:grid;place-items:center;padding:24px}.wrap{width:100%;max-width:470px}.brand{display:flex;align-items:center;gap:12px;margin:0 0 22px}.logo{width:44px;height:44px;border:1px solid #426475;background:linear-gradient(135deg,#15354a,#152b2f);border-radius:14px;display:grid;place-items:center;font-size:22px}.brand b{font-size:13px;letter-spacing:.18em}.brand span{display:block;color:var(--muted);font-size:11px;margin-top:4px;letter-spacing:.08em}.card{background:linear-gradient(160deg,rgba(16,26,43,.98),rgba(11,19,32,.98));border:1px solid var(--line);border-radius:24px;padding:28px;box-shadow:0 24px 90px #0007}.eyebrow{color:var(--accent);font-size:10px;letter-spacing:.2em;font-weight:800}.headline{font-size:27px;line-height:1.15;letter-spacing:-.04em;margin:12px 0}.desc{font-size:13px;line-height:1.7;color:var(--muted);margin:0 0 25px}.field{display:block;font-size:12px;font-weight:700;margin-bottom:9px}.input{width:100%;background:#080f1c;border:1px solid #34475f;border-radius:13px;padding:15px 14px;color:var(--text);font-size:16px;outline:none;transition:.2s}.input:focus{border-color:var(--accent);box-shadow:0 0 0 3px #9af0d01c}.hint{color:var(--muted);font-size:11px;line-height:1.6;margin:9px 0 20px}.btn{width:100%;border:0;border-radius:13px;padding:15px 18px;background:linear-gradient(100deg,var(--accent),var(--accent2));color:#08201f;font-weight:850;font-size:13px;cursor:pointer}.btn:disabled{opacity:.55;cursor:wait}.notice{display:none;margin-top:16px;padding:12px 13px;border:1px solid #395a60;border-radius:12px;background:#0c2528;color:#c4fff0;font-size:12px;line-height:1.6}.notice.error{border-color:#71494d;background:#2a171c;color:#ffd6d6}.foot{font-size:10px;color:#7186a2;line-height:1.7;text-align:center;margin:17px 10px 0}.secure{display:flex;gap:9px;align-items:flex-start;background:#0b1523;border:1px solid #26364b;border-radius:12px;padding:12px;margin:20px 0;font-size:11px;line-height:1.55;color:#a9b9cd}.secure svg{flex:none;margin-top:1px}@media(max-width:440px){body{padding:16px}.card{padding:22px;border-radius:20px}.headline{font-size:25px}}
</style></head><body><main class="wrap"><div class="brand"><div class="logo">◈</div><div><b>WHISKAY</b><span>SECURE PAIRING PORTAL</span></div></div><section class="card"><div class="eyebrow">DEVICE LINK · WHATSAPP</div><h1 class="headline">Hubungkan nomor<br>WhatsApp kamu.</h1><p class="desc">Masukkan nomor akun WhatsApp yang ingin dijadikan sub-bot. Setelah dikirim, kamu akan kembali ke WhatsApp untuk mengonfirmasi permintaan lewat bot Whiskay.</p><form id="form"><label class="field" for="phone">Nomor WhatsApp</label><input class="input" id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="628123456789" minlength="8" maxlength="20" required pattern="[0-9+() .-]{8,20}"><p class="hint">Gunakan kode negara, tanpa tanda plus. Contoh: <b>628123456789</b>. Masukkan hanya nomor yang kamu miliki atau berwenang menghubungkan.</p><button class="btn" id="submit" type="submit">Lanjutkan ke WhatsApp&nbsp; ↗</button></form><div class="secure"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9af0d0" stroke-width="1.8"><path d="M12 3 4.5 6v5.5c0 4.4 3.2 7.5 7.5 9.5 4.3-2 7.5-5.1 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/></svg><div><b>Privasi nomor</b><br>Nomor digunakan untuk permintaan pairing dan tidak ditampilkan di URL publik. Link ini hanya berlaku sekali dan kedaluwarsa dalam 10 menit.</div></div><div class="notice" id="notice" role="status" aria-live="polite"></div></section><p class="foot">WHISKAY JADIBOT · Jangan bagikan pairing code atau tautan verifikasi kepada siapa pun.</p></main><script>
const form=document.getElementById('form'),input=document.getElementById('phone'),button=document.getElementById('submit'),notice=document.getElementById('notice');
form.addEventListener('submit',async e=>{e.preventDefault();const phone=input.value.trim();notice.style.display='none';button.disabled=true;button.textContent='Menyiapkan tautan aman…';try{const endpoint=new URL('/api/pair/${ticket}',window.location.origin).toString();const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Permintaan gagal diproses.');notice.className='notice';notice.textContent='Nomor diterima. WhatsApp akan dibuka dengan pesan konfirmasi yang sudah disiapkan. Tekan tombol Kirim di WhatsApp agar bot dapat memverifikasi permintaan.';notice.style.display='block';button.textContent='Buka WhatsApp lagi ↗';button.disabled=false;window.location.href=d.whatsappUrl;}catch(err){notice.className='notice error';notice.textContent=(err&&err.message==='Failed to fetch')?'API portal tidak terjangkau. Pastikan domain ini mem-proxy GET /pair/* dan POST /api/pair/* ke proses WHISKAY pada port JADIBOT_PORT. Periksa .jadibotstatus di WhatsApp dan buat tautan baru jika perlu.':(err.message||'Terjadi gangguan. Coba buat link baru dari bot.');notice.style.display='block';button.disabled=false;button.textContent='Coba lagi';}});
</script></body></html>`;

async function readRequestBody(req, maxBytes = 4096) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body, 'utf8') > maxBytes) throw new Error('payload_too_large');
  }
  return JSON.parse(body || '{}');
}
async function ensureCloudflared() {
  const found = spawnSync('cloudflared', ['--version'], { encoding: 'utf8', timeout: 4000 });
  if (!found.error && found.status === 0) return 'cloudflared';
  if (process.platform !== 'linux') throw new Error('Auto-download TryCloudflare saat ini hanya disiapkan untuk Linux. Instal cloudflared manual atau set JADIBOT_PUBLIC_URL.');
  const arch = ({ x64: 'amd64', arm64: 'arm64', arm: 'arm' })[process.arch];
  if (!arch) throw new Error(`Arsitektur ${process.arch} belum didukung untuk auto-install cloudflared.`);
  const destDir = path.resolve(process.env.JADIBOT_BIN_DIR || './data/bin');
  const dest = path.join(destDir, `cloudflared-linux-${arch}`);
  try { await access(dest); return dest; } catch {}
  await mkdir(destDir, { recursive: true, mode: 0o700 });
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000), redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Unduhan cloudflared gagal (HTTP ${response.status}).`);
  const tmp = `${dest}.download`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(tmp, { mode: 0o700 }));
  const stat = await (await import('node:fs/promises')).stat(tmp);
  if (stat.size < 1024 * 1024 || stat.size > 100 * 1024 * 1024) { await rm(tmp, { force: true }); throw new Error('Ukuran binary cloudflared tidak wajar; unduhan dibatalkan.'); }
  await rename(tmp, dest);
  await chmod(dest, 0o700);
  return dest;
}
function startTunnel(executable) {
  return new Promise(resolve => {
    stopRequested = false;
    let settled = false;
    const finish = value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
    tunnel = spawn(executable, ['tunnel', '--url', `http://127.0.0.1:${PORT}`, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const inspect = chunk => {
      const text = String(chunk || '');
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match) { tunnelUrl = match[0]; publicBaseUrl = tunnelUrl; portalMode = 'trycloudflare'; console.log(`[jadibot-portal] TryCloudflare active: ${publicBaseUrl}`); finish(publicBaseUrl); }
      if (/failed to start|authentication error|failed to create quick tunnel/i.test(text)) console.warn('[jadibot-portal] Cloudflare tunnel log indicates startup trouble.');
    };
    tunnel.stdout.on('data', inspect); tunnel.stderr.on('data', inspect);
    tunnel.on('error', error => { console.warn('[jadibot-portal] cloudflared error:', error.message); finish(''); });
    tunnel.on('exit', code => { if (!stopRequested) { tunnel = null; tunnelUrl = ''; if (portalMode === 'trycloudflare') { publicBaseUrl = ''; portalMode = 'tunnel-disconnected'; } } finish(''); if (!stopRequested && code) console.warn(`[jadibot-portal] cloudflared exit code ${code}.`); });
    const timer = setTimeout(() => finish(''), Number(process.env.JADIBOT_TUNNEL_WAIT_MS || 8000));
  });
}

export async function startPairingPortal() {
  if (server) return { ok: true, url: publicBaseUrl, mode: portalMode, port: PORT };
  stopRequested = false;
  const envBase = publicUrlFromEnv();
  const mode = detectPortalMode();
  portalMode = mode;
  if (envBase && mode !== 'trycloudflare') publicBaseUrl = envBase;
  await mkdir(ROOT, { recursive: true, mode: 0o700 });
  server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { ok: true, service: 'whiskay-jadibot-portal', mode: portalMode });
    const page = url.pathname.match(/^\/pair\/([a-f0-9]{48})\/?$/);
    if (req.method === 'GET' && page) {
      const ticket = await getPairingTicket(page[1]);
      if (!ticket) { res.writeHead(410, pageHeaders); return res.end('<!doctype html><meta charset="utf-8"><title>Link expired</title><body style="background:#080d17;color:#edf4ff;font:16px system-ui;padding:3rem">Link tidak aktif. Kembali ke WhatsApp dan gunakan <b>.jadibot pairing</b> untuk membuat tautan baru.</body>'); }
      res.writeHead(200, pageHeaders); return res.end(HTML(page[1]));
    }
    const api = url.pathname.match(/^\/api\/pair\/([a-f0-9]{48})\/?$/);
    if (req.method === 'POST' && api) {
      const remote = req.socket?.remoteAddress || 'unknown';
      const rate = checkPairingSubmitRateLimit(remote);
      if (!rate.allowed) {
        res.setHeader('retry-after', String(rate.retryAfterSeconds));
        return json(res, 429, { ok: false, error: 'Terlalu banyak percobaan. Tunggu sebentar atau buat tautan pairing baru dari bot.' });
      }
      const contentType = String(req.headers['content-type'] || '').toLowerCase();
      if (!contentType.startsWith('application/json')) return json(res, 415, { ok: false, error: 'Gunakan format permintaan JSON.' });
      const declaredLength = Number(req.headers['content-length'] || 0);
      if (declaredLength > 4096) return json(res, 413, { ok: false, error: 'Data terlalu besar.' });
      try {
        const body = await readRequestBody(req);
        const result = await submitPairingPhone(api[1], body.phone);
        return json(res, result.ok ? 200 : 400, result);
      } catch (error) {
        return json(res, error.message === 'payload_too_large' ? 413 : 400, { ok: false, error: error.message === 'payload_too_large' ? 'Data terlalu besar.' : 'Format permintaan tidak valid.' });
      }
    }
    if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, pageHeaders); return res.end('<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WHISKAY Pairing Portal</title><body style="margin:0;background:#080d17;color:#edf4ff;font:15px system-ui;padding:12vh 8vw;line-height:1.7"><h1>WHISKAY · Secure Pairing</h1><p>Portal pairing ini menggunakan tautan sekali pakai yang dikirim melalui WhatsApp. Buka tombol <b>Pairing Portal</b> dari pesan bot untuk melanjutkan.</p><p>Jangan bagikan kode pairing atau tautan kepada orang lain.</p></body></html>'); }
    return json(res, 404, { ok: false, error: 'not_found' });
  });
  server.on('clientError', (_, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, HOST, () => { server.off('error', reject); resolve(); }); });
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, times] of submitAttempts) { const valid = times.filter(ts => now - ts < SUBMIT_WINDOW_MS); if (valid.length) submitAttempts.set(ip, valid); else submitAttempts.delete(ip); }
    void mutateTickets(db => { cleanExpired(db, now); }).catch(error => console.warn('[jadibot-portal] ticket cleanup failed:', error.message));
  }, 60_000);
  cleanupTimer.unref?.();
  console.log(`[jadibot-portal] Listening on ${HOST}:${PORT} (${os.platform()}/${os.arch()})`);
  if (publicBaseUrl) {
    portalMode = 'public-url';
    console.log(`[jadibot-portal] Using configured public URL: ${publicBaseUrl}`);
  } else if (mode === 'trycloudflare') {
    portalMode = 'tunnel-starting';
    // Do not block Baileys startup while downloading cloudflared/establishing the tunnel.
    // The command handler waits briefly for a public URL only when the user requests pairing.
    void (async () => {
      try {
        const exe = await ensureCloudflared();
        if (!stopRequested) await startTunnel(exe);
      } catch (error) {
        portalMode = 'tunnel-failed';
        console.warn(`[jadibot-portal] TryCloudflare is not available: ${error.message}`);
      }
    })();
  } else {
    portalMode = 'external-required';
    console.warn('[jadibot-portal] Deployment/server mode detected. Tunnel is disabled. Set JADIBOT_PUBLIC_URL to the HTTPS URL that reverse-proxies this portal port.');
  }
  return { ok: true, url: publicBaseUrl, mode: portalMode, port: PORT };
}

export async function stopPairingPortal() {
  stopRequested = true;
  if (cleanupTimer) { clearInterval(cleanupTimer); cleanupTimer = null; }
  if (tunnel) { try { tunnel.kill('SIGTERM'); } catch {} tunnel = null; }
  tunnelUrl = '';
  publicBaseUrl = '';
  if (server) { const old = server; server = null; await new Promise(resolve => old.close(() => resolve())); }
}

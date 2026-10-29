import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
const TIMEOUT_MS = 15000;
const MAX_URL_LENGTH = 2048;
const MAX_PROVIDER_RESPONSE_BYTES = 1_048_576;
const PENDING_TTL_MS = 10 * 60_000;
const MAX_PENDING_CHOICES = 2000;
export function normalizeMediaUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || '')); } catch { throw new Error('URL tidak valid.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Hanya URL HTTP/HTTPS yang didukung.');
  if (parsed.username || parsed.password) throw new Error('URL dengan kredensial tidak diizinkan.');
  if (parsed.href.length > MAX_URL_LENGTH) throw new Error('URL terlalu panjang.');
  return parsed.href;
}
function isPrivateIpv4(host) {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 || (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113);
}
function isPrivateIpv6(host) {
  const value = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') ||
      /^fe[89ab]/.test(value) || value.startsWith('ff')) return true;
  const mapped = value.match(/^(?:0:){0,5}ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return Boolean(mapped && isPrivateIpv4(mapped[1]));
}

/** Validate URLs returned by third-party downloader providers before Baileys fetches them. */
export function normalizeProviderMediaUrl(value) {
  const href = normalizeMediaUrl(value);
  const parsed = new URL(href);
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Provider mengembalikan host lokal yang tidak diizinkan.');
  }
  const ipVersion = isIP(host);
  if ((ipVersion === 4 && isPrivateIpv4(host)) || (ipVersion === 6 && isPrivateIpv6(host))) {
    throw new Error('Provider mengembalikan alamat IP privat/reserved yang tidak diizinkan.');
  }
  return href;
}

export function platformMatches(platform, url) {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  const domains = {
    tiktok: ['tiktok.com','vm.tiktok.com','vt.tiktok.com'],
    instagram: ['instagram.com'],
    facebook: ['facebook.com','fb.watch','m.facebook.com'],
    pinterest: ['pinterest.com','pin.it'],
    mediafire: ['mediafire.com'],
    spotify: ['spotify.com'],
    youtube: ['youtube.com','youtu.be','youtube-nocookie.com'],
    rednote: ['xiaohongshu.com','xhslink.com'],
  };
  return (domains[platform] || []).some(d => host === d || host.endsWith(`.${d}`));
}
export function getDownloaderEndpoints(env = process.env) {
  const parse = value => String(value || '').split(/[,\n;]/).map(x => x.trim()).filter(Boolean);
  const values = [...parse(env.MEDIA_DOWNLOADER_API_URLS), ...parse(env.MEDIA_DOWNLOADER_API_URL)];
  const unique = [...new Set(values)];
  return unique.filter(value => {
    try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password; }
    catch { return false; }
  }).slice(0, 5);
}
async function readProviderJson(response) {
  const declaredLength = Number(response.headers?.get?.('content-length') || 0);
  if (declaredLength > MAX_PROVIDER_RESPONSE_BYTES) throw new Error('Respons provider terlalu besar.');
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_PROVIDER_RESPONSE_BYTES) throw new Error('Respons provider terlalu besar.');
    return JSON.parse(text);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error('Respons provider terlalu besar.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function resolveMedia(platform, url) {
  const cleanUrl = normalizeMediaUrl(url);
  if (!platformMatches(platform, cleanUrl)) throw new Error(`URL bukan tautan ${platform} yang didukung.`);
  const endpoints = getDownloaderEndpoints();
  if (!endpoints.length) throw new Error('Layanan downloader belum dikonfigurasi admin (MEDIA_DOWNLOADER_API_URLS).');
  const errors = [];
  for (const endpoint of endpoints) {
    const api = new URL(endpoint);
    api.searchParams.set('platform', platform);
    api.searchParams.set('url', cleanUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(api, { headers: { accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await readProviderJson(response);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Format respons provider tidak valid.');
      const videoHD = data.videoHD || data.hd || data.video || '';
      const videoSD = data.videoSD || data.sd || data.video || '';
      const audio = data.audio || data.mp3 || '';
      const safeVideoHD = videoHD ? normalizeProviderMediaUrl(videoHD) : '';
      const safeVideoSD = videoSD ? normalizeProviderMediaUrl(videoSD) : '';
      const safeAudio = audio ? normalizeProviderMediaUrl(audio) : '';
      const rawThumbnail = data.thumbnail || data.thumbnailUrl || data.thumb || '';
      const thumbnail = rawThumbnail ? normalizeProviderMediaUrl(rawThumbnail) : '';
      if (!safeVideoHD && !safeVideoSD && !safeAudio) throw new Error('Provider tidak mengembalikan media yang bisa diunduh.');
      const title = String(data.title || 'Media').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Media';
      return { url: cleanUrl, title, thumbnail, videoHD: safeVideoHD, videoSD: safeVideoSD, audio: safeAudio, provider: new URL(endpoint).host };
    } catch (error) {
      errors.push(error?.name === 'AbortError' ? 'timeout' : String(error?.message || 'provider error').slice(0, 100));
    } finally { clearTimeout(timer); }
  }
  throw new Error(`Semua provider downloader gagal (${errors.join('; ')}). Periksa MEDIA_DOWNLOADER_API_URLS atau coba lagi nanti.`);
}
export async function sendDownloadChoices(ctx, platform, url) {
  const media = await resolveMedia(platform, url);
  const token = randomBytes(18).toString('hex');
  cleanExpiredPending();
  while (pending.size >= MAX_PENDING_CHOICES) pending.delete(pending.keys().next().value);
  pending.set(token, { platform, media, sender: ctx.sender, chat: ctx.chat, expiresAt: Date.now() + PENDING_TTL_MS });
  const buttons = [
    ...(media.videoHD ? [{ title: '🎥 Video HD', id: `${ctx.prefix || '.'}dlselect ${token} hd` }] : []),
    ...(media.videoSD ? [{ title: '🎥 Video SD', id: `${ctx.prefix || '.'}dlselect ${token} sd` }] : []),
    ...(media.audio ? [{ title: '🎵 Audio', id: `${ctx.prefix || '.'}dlselect ${token} audio` }] : [])
  ];
  const payload = { title: `⬇️ ${platform.toUpperCase()} DOWNLOADER`, subtitle: media.title, body: `Pilih format yang ingin kamu terima. Tautan berlaku 10 menit.${media.provider ? `\nProvider: ${media.provider}` : ''}`, footer: 'WHISKAY Bot · Gunakan hanya untuk konten yang boleh kamu unduh.', buttons, ...(media.thumbnail ? { thumbnail: media.thumbnail, image: media.thumbnail } : {}), url: media.url };
  if (typeof ctx.sendInteractive === 'function') return ctx.sendInteractive(payload);
  return ctx.reply([payload.title, payload.subtitle, payload.body, ...buttons.map(b => `${b.title}: ${b.id}`)].join('\n'));
}
const pending = new Map();
export function takePending(token, sender, chat, format = '') {
  const key = String(token || '');
  const item = pending.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    pending.delete(key);
    return null;
  }
  // Do not let an unauthorized sender invalidate another user's valid button token.
  if (item.sender !== sender || item.chat !== chat) return null;
  // A forged/unavailable format must not burn a valid token; let the user choose again.
  if (format && !({ hd: item.media.videoHD, sd: item.media.videoSD, audio: item.media.audio }[format])) return null;
  pending.delete(key);
  return item;
}
export function cleanExpiredPending() {
  for (const [key, value] of pending) if (value.expiresAt < Date.now()) pending.delete(key);
}

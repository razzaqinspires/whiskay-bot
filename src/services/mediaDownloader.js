import { randomBytes } from 'node:crypto';
const TIMEOUT_MS = 15000;
const MAX_URL_LENGTH = 2048;
export function normalizeMediaUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || '')); } catch { throw new Error('URL tidak valid.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Hanya URL HTTP/HTTPS yang didukung.');
  if (parsed.username || parsed.password) throw new Error('URL dengan kredensial tidak diizinkan.');
  if (parsed.href.length > MAX_URL_LENGTH) throw new Error('URL terlalu panjang.');
  return parsed.href;
}
export function platformMatches(platform, url) {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  const domains = { tiktok: ['tiktok.com','vm.tiktok.com','vt.tiktok.com'], instagram: ['instagram.com'], facebook: ['facebook.com','fb.watch','m.facebook.com'] };
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
      const data = await response.json();
      const videoHD = data.videoHD || data.hd || data.video || '';
      const videoSD = data.videoSD || data.sd || data.video || '';
      const audio = data.audio || data.mp3 || '';
      for (const v of [videoHD, videoSD, audio].filter(Boolean)) normalizeMediaUrl(v);
      const thumbnail = data.thumbnail || data.thumbnailUrl || data.thumb || '';
      if (thumbnail) normalizeMediaUrl(thumbnail);
      if (!videoHD && !videoSD && !audio) throw new Error('Provider tidak mengembalikan media yang bisa diunduh.');
      return { url: cleanUrl, title: String(data.title || 'Media').slice(0, 120), thumbnail, videoHD, videoSD, audio, provider: new URL(endpoint).host };
    } catch (error) {
      errors.push(error?.name === 'AbortError' ? 'timeout' : String(error?.message || 'provider error').slice(0, 100));
    } finally { clearTimeout(timer); }
  }
  throw new Error(`Semua provider downloader gagal (${errors.join('; ')}). Periksa MEDIA_DOWNLOADER_API_URLS atau coba lagi nanti.`);
}
export async function sendDownloadChoices(ctx, platform, url) {
  const media = await resolveMedia(platform, url);
  const token = randomBytes(18).toString('hex');
  pending.set(token, { platform, media, sender: ctx.sender, chat: ctx.chat, expiresAt: Date.now() + 10 * 60_000 });
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
export function takePending(token, sender, chat) {
  const item = pending.get(String(token || ''));
  if (!item) return null;
  pending.delete(String(token));
  if (item.expiresAt < Date.now() || item.sender !== sender || item.chat !== chat) return null;
  return item;
}
export function cleanExpiredPending() {
  for (const [key, value] of pending) if (value.expiresAt < Date.now()) pending.delete(key);
}

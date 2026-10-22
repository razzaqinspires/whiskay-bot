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
export async function resolveMedia(platform, url) {
  const cleanUrl = normalizeMediaUrl(url);
  if (!platformMatches(platform, cleanUrl)) throw new Error(`URL bukan tautan ${platform} yang didukung.`);
  const endpoint = String(process.env.MEDIA_DOWNLOADER_API_URL || '').trim();
  if (!endpoint) throw new Error('Layanan downloader belum dikonfigurasi admin (MEDIA_DOWNLOADER_API_URL).');
  const api = new URL(endpoint);
  if (!['http:', 'https:'].includes(api.protocol)) throw new Error('Konfigurasi downloader harus memakai HTTP/HTTPS.');
  api.searchParams.set('platform', platform);
  api.searchParams.set('url', cleanUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(api, { headers: { accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`Layanan downloader merespons HTTP ${response.status}.`);
    const data = await response.json();
    const videoHD = data.videoHD || data.hd || data.video || '';
    const videoSD = data.videoSD || data.sd || data.video || '';
    const audio = data.audio || data.mp3 || '';
    for (const v of [videoHD, videoSD, audio].filter(Boolean)) normalizeMediaUrl(v);
    const thumbnail = data.thumbnail || data.thumbnailUrl || data.thumb || '';
    if (thumbnail) normalizeMediaUrl(thumbnail);
    if (!videoHD && !videoSD && !audio) throw new Error('Provider tidak mengembalikan media yang bisa diunduh.');
    return { url: cleanUrl, title: String(data.title || 'Media').slice(0, 120), thumbnail, videoHD, videoSD, audio };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Layanan downloader timeout. Coba lagi nanti.');
    throw error;
  } finally { clearTimeout(timer); }
}
export async function sendDownloadChoices(ctx, platform, url) {
  const media = await resolveMedia(platform, url);
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  pending.set(token, { platform, media, sender: ctx.sender, chat: ctx.chat, expiresAt: Date.now() + 10 * 60_000 });
  const buttons = [
    ...(media.videoHD ? [{ title: '🎥 Video HD', id: `${ctx.prefix || '.'}dlselect ${token} hd` }] : []),
    ...(media.videoSD ? [{ title: '🎥 Video SD', id: `${ctx.prefix || '.'}dlselect ${token} sd` }] : []),
    ...(media.audio ? [{ title: '🎵 Audio', id: `${ctx.prefix || '.'}dlselect ${token} audio` }] : [])
  ];
  const payload = { title: `⬇️ ${platform.toUpperCase()} DOWNLOADER`, subtitle: media.title, body: 'Pilih format yang ingin kamu terima. Tautan berlaku 10 menit.', footer: 'WHISKAY Bot · Gunakan hanya untuk konten yang boleh kamu unduh.', buttons, ...(media.thumbnail ? { thumbnail: media.thumbnail, image: media.thumbnail } : {}), url: media.url };
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

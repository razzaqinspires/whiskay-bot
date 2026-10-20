const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 12_000;

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => { const code = Number(n); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''; })
    .replace(/&#x([\da-f]+);/gi, (_, n) => { const code = parseInt(n, 16); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''; });
}
function cleanText(html) {
  return decodeEntities(String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|canvas|iframe|form|nav|footer|header)[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/section|\/article|\/h[1-6]|\/li|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[\t\f\r ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function getMeta(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  ];
  for (const re of patterns) { const m = html.match(re); if (m?.[1]) return decodeEntities(m[1].trim()); }
  return '';
}
function validateTarget(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('URL tidak valid. Gunakan contoh: .scrape https://example.com'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Hanya URL HTTP/HTTPS yang diizinkan.');
  if (url.username || url.password) throw new Error('URL dengan username/password tidak diizinkan.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' || host === '::' || /^(127\.|10\.|192\.168\.|169\.254\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === '0.0.0.0') {
    throw new Error('Alamat lokal/private tidak boleh di-scrape.');
  }
  return url;
}
export default {
  name: 'scrape', command: ['scrape'], menuCommands: ['scrape'],
  description: 'Ambil metadata dan teks utama dari halaman web publik', category: 'tools', cooldown: 8000,
  async execute(ctx) {
    const raw = (ctx.args || []).join(' ').trim();
    if (!raw) return ctx.reply(`Scrape halaman web publik\n\nPemakaian: ${ctx.prefix}scrape https://example.com\nBot mengambil judul, deskripsi, dan cuplikan teks. Tidak untuk halaman login atau konten privat.`);
    let url;
    try { url = validateTarget(raw); } catch (e) { return ctx.reply(`Scrape gagal: ${e.message}`); }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { 'user-agent': 'WhiskayBot-Scraper/1.0 (+public-page metadata)', accept: 'text/html, text/plain;q=0.9' }
      });
      if (response.status >= 300 && response.status < 400) return ctx.reply('Scrape dihentikan: situs mengarahkan ke URL lain. Gunakan URL tujuan langsung.');
      if (!response.ok) return ctx.reply(`Scrape gagal: server membalas HTTP ${response.status}.`);
      const type = String(response.headers.get('content-type') || '').toLowerCase();
      if (!type.includes('text/html') && !type.includes('text/plain')) return ctx.reply(`Tipe konten tidak didukung (${type || 'tidak diketahui'}). Gunakan halaman HTML atau teks publik.`);
      const declared = Number(response.headers.get('content-length') || 0);
      if (declared > MAX_BYTES) return ctx.reply('Halaman terlalu besar untuk diproses (batas 1 MB).');
      const reader = response.body?.getReader();
      if (!reader) return ctx.reply('Tidak bisa membaca isi halaman.');
      const chunks = []; let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) { await reader.cancel(); return ctx.reply('Halaman terlalu besar untuk diproses (batas 1 MB).'); }
        chunks.push(Buffer.from(value));
      }
      const source = Buffer.concat(chunks).toString('utf8');
      const title = decodeEntities((source.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || getMeta(source, 'og:title') || url.hostname).replace(/\s+/g, ' ').trim();
      const description = getMeta(source, 'description') || getMeta(source, 'og:description') || '';
      const text = type.includes('text/html') ? cleanText(source) : source.replace(/\s+/g, ' ').trim();
      const excerpt = text.slice(0, 3200) || '(Tidak ada teks yang bisa diekstrak.)';
      return ctx.reply(`SCRAPE RESULT\nJudul: ${title.slice(0, 240)}\nURL: ${url.href}\n${description ? `Deskripsi: ${description.slice(0, 500)}\n` : ''}\nCuplikan teks:\n${excerpt}${text.length > excerpt.length ? '\n\n[Cuplikan dipotong]' : ''}`);
    } catch (e) {
      const message = e?.name === 'AbortError' ? 'Waktu tunggu habis (12 detik).' : String(e?.message || e).slice(0, 220);
      return ctx.reply(`Scrape gagal: ${message}`);
    } finally { clearTimeout(timer); }
  }
};

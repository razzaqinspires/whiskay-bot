import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIBRARY_FILE = path.resolve(__dirname, '../lib/external/westmanga/westmanga-scraper.cjs');
const sourceModule = require(LIBRARY_FILE);

const ATTRIBUTION = 'Westmanga scraper source supplied by the user’s friend. Original source is preserved unchanged.';
const DEFAULTS = Object.freeze({
  responseStyle: process.env.WESTMANGA_RESPONSE_STYLE || 'compact',
  page: Number.parseInt(process.env.WESTMANGA_DEFAULT_PAGE || '1', 10),
  perPage: Number.parseInt(process.env.WESTMANGA_PER_PAGE || '10', 10),
  userAgentPreset: process.env.WESTMANGA_USER_AGENT_PRESET || 'desktop',
  downloadDirectory: process.env.WESTMANGA_DOWNLOAD_DIR || path.join(process.env.WHISKAY_DATA_DIR || 'data', 'downloads', 'westmanga'),
  fallbackEnabled: process.env.WESTMANGA_FALLBACK_ENABLED !== 'false',
});

const providers = new Map();
const providerHealth = new Map();
providers.set('westmanga', Object.freeze({
  id: 'westmanga',
  source: sourceModule,
  capabilities: Object.freeze(['home', 'search', 'detail', 'read', 'download']),
}));
providerHealth.set('westmanga', { failures: 0, cooldownUntil: 0, lastError: null });

function safeStyle(value) {
  return ['compact', 'detailed', 'minimal'].includes(value) ? value : DEFAULTS.responseStyle;
}
function cleanSlug(value) {
  const parsed = sourceModule.parseInputSlug(String(value || '').trim());
  if (!parsed?.slug || !/^[a-z0-9][a-z0-9-]{0,180}$/i.test(parsed.slug)) {
    throw new Error('Slug Westmanga tidak valid.');
  }
  return parsed;
}
function assertAllowedTarget(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Masukkan kata kunci, slug, atau URL Westmanga.');
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    const allowed = new Set(['v1.westmanga.my', 'westmanga.my', 'westmanga.site']);
    if (!allowed.has(url.hostname.toLowerCase())) throw new Error('Domain tidak termasuk sumber Westmanga yang diizinkan.');
  }
  return cleanSlug(raw);
}
function isRetryable(error) {
  const message = String(error?.message || error || '');
  return /HTTP 5\d\d|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket|network/i.test(message);
}
function markProviderResult(id, error = null) {
  const state = providerHealth.get(id) || { failures: 0, cooldownUntil: 0, lastError: null };
  if (!error) {
    state.failures = 0;
    state.cooldownUntil = 0;
    state.lastError = null;
  } else {
    state.failures += 1;
    state.lastError = String(error.message || error).slice(0, 240);
    if (state.failures >= 3) state.cooldownUntil = Date.now() + Math.min(60_000, state.failures * 5_000);
  }
  providerHealth.set(id, state);
}
async function invoke(capability, args, options = {}) {
  const ordered = [...providers.values()].filter(provider => provider.capabilities.includes(capability));
  if (!ordered.length) throw new Error(`Tidak ada provider yang mendukung ${capability}.`);
  const errors = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const provider = ordered[index];
    const health = providerHealth.get(provider.id);
    if (health?.cooldownUntil > Date.now()) {
      errors.push(new Error(`${provider.id} sedang cooldown.`));
      continue;
    }
    try {
      const fn = provider.source[capability === 'detail' ? 'getComicDetail' : capability === 'read' ? 'getChapterImages' : capability === 'download' ? 'downloadChapter' : capability === 'search' ? 'search' : 'getHome'];
      const result = await fn(...args, {
        preset: options.preset || DEFAULTS.userAgentPreset,
        page: options.page || DEFAULTS.page,
        perPage: options.perPage || DEFAULTS.perPage,
        outDir: options.outDir || DEFAULTS.downloadDirectory,
        ...(options.requestOptions || {}),
      });
      markProviderResult(provider.id);
      return { provider: provider.id, result, attribution: ATTRIBUTION };
    } catch (error) {
      markProviderResult(provider.id, error);
      errors.push(error);
      if (!DEFAULTS.fallbackEnabled || !isRetryable(error)) break;
    }
  }
  const reason = errors.at(-1)?.message || 'Tidak diketahui';
  throw new Error(`Seluruh provider Westmanga gagal atau tidak tersedia. ${reason}`);
}

export function registerWestmangaFallback(provider) {
  if (!provider || typeof provider.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,40}$/i.test(provider.id)) throw new TypeError('Provider harus memiliki id yang valid.');
  if (provider.id === 'westmanga' || providers.has(provider.id)) throw new Error(`Provider ${provider.id} sudah terdaftar.`);
  if (!provider.source || typeof provider.source !== 'object') throw new TypeError('Provider source harus berupa object fungsi.');
  const allowed = ['home', 'search', 'detail', 'read', 'download'];
  const capabilities = (provider.capabilities || []).filter(item => allowed.includes(item));
  if (!capabilities.length) throw new Error('Provider tidak memiliki capability yang didukung.');
  providers.set(provider.id, Object.freeze({ id: provider.id, source: provider.source, capabilities: Object.freeze(capabilities) }));
  providerHealth.set(provider.id, { failures: 0, cooldownUntil: 0, lastError: null });
  return getWestmangaControllerStatus();
}

export function getWestmangaControllerStatus() {
  return {
    library: 'westmanga',
    sourceFormat: 'CommonJS (.cjs)',
    sourceFile: 'src/lib/external/westmanga/westmanga-scraper.cjs',
    sourceProtected: true,
    attribution: ATTRIBUTION,
    settings: { ...DEFAULTS },
    providers: [...providers.keys()].map(id => ({ id, capabilities: [...providers.get(id).capabilities], ...(providerHealth.get(id) || {}) })),
  };
}

export function parseWestmangaTarget(value) {
  return assertAllowedTarget(value);
}

export function formatWestmangaResult(kind, payload, style = DEFAULTS.responseStyle) {
  const mode = safeStyle(style);
  const data = payload?.result ?? payload;
  const attribution = payload?.attribution || ATTRIBUTION;
  if (kind === 'search') {
    const items = data?.results || [];
    const limit = mode === 'minimal' ? 5 : mode === 'compact' ? 10 : 30;
    const rows = items.slice(0, limit).map((item, index) => mode === 'minimal'
      ? `${index + 1}. ${item.title} — ${item.slug}`
      : `${index + 1}. *${item.title}*\n   Status: ${item.status || '-'} · Rating: ${item.rating ?? '-'}\n   Slug: ${item.slug}\n   ${item.cover || ''}`);
    return [`Hasil pencarian Westmanga: ${items.length}`, ...rows, items.length > limit ? `Dan ${items.length - limit} hasil lainnya.` : '', `Sumber: ${attribution}`].filter(Boolean).join('\n');
  }
  if (kind === 'detail') {
    const chapters = data?.chapters || [];
    const limit = mode === 'minimal' ? 5 : mode === 'compact' ? 10 : chapters.length;
    return [`*${data?.title || 'Judul tidak tersedia'}*`, `Status: ${data?.status || '-'}`, `Author: ${data?.author || '-'}`, `Genre: ${(data?.genres || []).join(', ') || '-'}`, `Chapter: ${data?.chaptersCount ?? chapters.length}`, mode === 'detailed' ? `\nSinopsis:\n${data?.synopsis || '-'}` : '', '\nChapter terbaru:', ...chapters.slice(0, limit).map(ch => `• ${ch.number} — ${ch.title || ch.slug}`), `Sumber: ${attribution}`].filter(Boolean).join('\n');
  }
  if (kind === 'home') {
    const sections = [['Pembaruan mirror', data?.mirrorUpdates], ['Populer', data?.popular], ['Proyek baru', data?.newProjects], ['Pembaruan proyek', data?.projectUpdates]];
    return [...sections.map(([title, items]) => `*${title}*\n${(items || []).slice(0, mode === 'minimal' ? 3 : 5).map(item => `• ${item.title} (${item.slug})`).join('\n') || 'Belum ada data'}`), `Sumber: ${attribution}`].join('\n\n');
  }
  if (kind === 'read') {
    const images = data?.images || [];
    const limit = mode === 'detailed' ? images.length : mode === 'minimal' ? 5 : 15;
    return [`*${data?.comicTitle || 'Westmanga'}*`, `Chapter: ${data?.chapterNumber || data?.chapterSlug || '-'}`, `Jumlah halaman: ${data?.imageCount ?? images.length}`, ...images.slice(0, limit).map(image => `${image.page}. ${image.url}`), `Sumber: ${attribution}`].join('\n');
  }
  return `Operasi Westmanga selesai.\nSumber: ${attribution}`;
}

export async function westmangaHome(options = {}) { return invoke('home', [], options); }
export async function westmangaSearch(query, options = {}) {
  const value = String(query || '').trim();
  if (!value || value.length > 120) throw new Error('Kata kunci wajib diisi (maksimal 120 karakter).');
  return invoke('search', [value], options);
}
export async function westmangaDetail(target, options = {}) {
  const parsed = assertAllowedTarget(target);
  if (parsed.type === 'read') throw new Error('URL tersebut adalah chapter. Gunakan operasi read.');
  return invoke('detail', [parsed.slug], options);
}
export async function westmangaRead(target, options = {}) {
  const parsed = assertAllowedTarget(target);
  if (parsed.type !== 'read') throw new Error('Target harus berupa URL atau slug chapter.');
  return invoke('read', [parsed.slug], options);
}
export async function westmangaDownload(target, options = {}) {
  const { downloadWestmangaChapter } = await import('./WestmangaDownloadGuard.js');
  return downloadWestmangaChapter(target, {
    ...options,
    outDir: options.outDir || DEFAULTS.downloadDirectory,
    preset: options.preset || DEFAULTS.userAgentPreset,
  });
}

export default Object.freeze({
  home: westmangaHome,
  search: westmangaSearch,
  detail: westmangaDetail,
  read: westmangaRead,
  download: westmangaDownload,
  format: formatWestmangaResult,
  parseTarget: parseWestmangaTarget,
  registerFallback: registerWestmangaFallback,
  status: getWestmangaControllerStatus,
});

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { mkdir, lstat, realpath, rename, rm, link } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const library = require(path.resolve(here, '../lib/external/westmanga/westmanga-scraper.cjs'));

export const WESTMANGA_ALLOWED_HOSTS = Object.freeze([
  'v1.westmanga.my',
  'westmanga.my',
  'westmanga.site',
]);
export const WESTMANGA_DOWNLOAD_LIMITS = Object.freeze({
  maxRedirects: 4,
  maxPages: 120,
  maxFileBytes: 15 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  timeoutMs: 30_000,
});

function isPrivateAddress(address) {
  const ipVersion = isIP(address);
  if (ipVersion === 4) {
    const octets = address.split('.').map(Number);
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0);
  }
  if (ipVersion === 6) {
    const normalized = address.toLowerCase().split('%')[0];
    // Permit only global-unicast 2000::/3; deny mapped, loopback, ULA,
    // link-local, multicast, unspecified and documentation prefixes.
    return !(normalized.startsWith('2') || normalized.startsWith('3')) ||
      normalized.startsWith('2001:db8:') || normalized.startsWith('::ffff:');
  }
  return true;
}

export async function validateWestmangaDownloadUrl(input, { resolveDns = true } = {}) {
  let url;
  try { url = new URL(String(input)); } catch { throw new Error('URL gambar tidak valid.'); }
  if (url.protocol !== 'https:') throw new Error('Unduhan hanya mengizinkan HTTPS.');
  if (url.username || url.password) throw new Error('URL dengan kredensial ditolak.');
  if (url.port && url.port !== '443') throw new Error('Port URL tidak diizinkan.');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!WESTMANGA_ALLOWED_HOSTS.includes(hostname)) throw new Error(`Host CDN tidak diizinkan: ${hostname}`);
  if (resolveDns) {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(entry => isPrivateAddress(entry.address))) {
      throw new Error(`Resolusi DNS host ditolak karena kosong atau mengarah ke jaringan privat: ${hostname}`);
    }
  }
  url.hash = '';
  return url;
}

function extensionFromResponse(url, contentType) {
  const fromPath = path.extname(new URL(url).pathname).toLowerCase();
  if (['.jpg','.jpeg','.png','.webp','.gif','.avif'].includes(fromPath)) return fromPath;
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  const map = { 'image/jpeg':'.jpg', 'image/png':'.png', 'image/webp':'.webp', 'image/gif':'.gif', 'image/avif':'.avif' };
  return map[mime] || '';
}

async function fetchValidated(input, options = {}) {
  let url = await validateWestmangaDownloadUrl(input);
  for (let hop = 0; hop <= WESTMANGA_DOWNLOAD_LIMITS.maxRedirects; hop++) {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(WESTMANGA_DOWNLOAD_LIMITS.timeoutMs),
      headers: {
        'User-Agent': options.userAgent || library.DEFAULT_USER_AGENT,
        'Referer': 'https://v1.westmanga.my/',
        'Accept': 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5',
      },
    });
    if ([301,302,303,307,308].includes(response.status)) {
      if (hop === WESTMANGA_DOWNLOAD_LIMITS.maxRedirects) throw new Error('Batas redirect unduhan terlampaui.');
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => {});
      if (!location) throw new Error('Redirect tanpa Location ditolak.');
      url = await validateWestmangaDownloadUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Unduhan gagal: HTTP ${response.status}.`);
    }
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    if (!type.startsWith('image/')) throw new Error(`Content-Type bukan gambar: ${type || 'tidak diketahui'}.`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > WESTMANGA_DOWNLOAD_LIMITS.maxFileBytes) throw new Error('Ukuran gambar melewati batas 15 MiB.');
    if (!extensionFromResponse(url.href, type)) throw new Error('Format gambar tidak didukung.');
    if (!response.body) throw new Error('Body unduhan kosong.');
    return { response, url, contentType: type, extension: extensionFromResponse(url.href, type), length };
  }
  throw new Error('Redirect tidak dapat diselesaikan.');
}

async function ensureNoSymlinkPath(target) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let cursor = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink()) throw new Error(`Direktori unduhan symlink ditolak: ${cursor}`);
      if (!info.isDirectory()) throw new Error(`Komponen path bukan direktori: ${cursor}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await mkdir(cursor, { mode: 0o700 });
    }
  }
  return realpath(absolute);
}

function safeSegment(value) {
  const result = String(value || 'chapter').replace(/[^a-z0-9_-]/gi, '_').slice(0, 100);
  return result || 'chapter';
}

async function saveImage(url, destination, { userAgent, remainingBytes }) {
  const { response, extension, length } = await fetchValidated(url, { userAgent });
  if (length && length > remainingBytes) throw new Error('Ukuran total chapter melewati batas 100 MiB.');
  const temp = `${destination}.${randomUUID()}.part`;
  let written = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      written += chunk.length;
      if (written > WESTMANGA_DOWNLOAD_LIMITS.maxFileBytes || written > remainingBytes) {
        callback(new Error('Batas ukuran unduhan terlampaui.'));
        return;
      }
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(temp, { flags: 'wx', mode: 0o600 }));
    await rename(temp, destination);
    return { path: destination, bytes: written, extension };
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

export async function downloadWestmangaChapter(target, options = {}) {
  const parsed = library.parseInputSlug(String(target || '').trim());
  if (parsed.type !== 'read' || !/^[a-z0-9][a-z0-9-]{0,180}$/i.test(parsed.slug)) {
    throw new Error('Target harus berupa slug atau URL chapter Westmanga yang valid.');
  }
  const chapter = await library.getChapterImages(parsed.slug, { preset: options.preset || 'desktop' });
  if (!Array.isArray(chapter.images) || chapter.images.length === 0) throw new Error('Chapter tidak memiliki halaman gambar.');
  if (chapter.images.length > WESTMANGA_DOWNLOAD_LIMITS.maxPages) throw new Error(`Chapter melewati batas ${WESTMANGA_DOWNLOAD_LIMITS.maxPages} halaman.`);
  const projectRoot = path.resolve(here, '../..');
  const configured = path.resolve(projectRoot, options.outDir || process.env.WESTMANGA_DOWNLOAD_DIR || 'data/downloads/westmanga');
  const allowedRoot = path.resolve(projectRoot, 'data', 'downloads', 'westmanga');
  if (configured !== allowedRoot && !configured.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error('Direktori unduhan harus berada di data/downloads/westmanga/.');
  }
  const safeRoot = await ensureNoSymlinkPath(configured);
  const folderName = `${safeSegment(chapter.comicSlug || 'manga')}_${safeSegment(parsed.slug)}`;
  const destinationDir = path.join(safeRoot, folderName);
  const realDestination = await ensureNoSymlinkPath(destinationDir);
  if (!realDestination.startsWith(`${safeRoot}${path.sep}`)) throw new Error('Direktori hasil unduhan keluar dari root yang diizinkan.');
  const results = [];
  let totalBytes = 0;
  try {
    for (const image of chapter.images) {
      const page = Number(image.page);
      if (!Number.isInteger(page) || page < 1 || page > WESTMANGA_DOWNLOAD_LIMITS.maxPages) throw new Error('Nomor halaman tidak valid.');
      const url = await validateWestmangaDownloadUrl(image.url);
      const filename = `${String(page).padStart(3,'0')}`;
      const saved = await saveImage(url.href, path.join(realDestination, `${filename}.img`), {
        userAgent: options.userAgent,
        remainingBytes: WESTMANGA_DOWNLOAD_LIMITS.maxTotalBytes - totalBytes,
      });
      const finalPath = path.join(realDestination, `${filename}${saved.extension}`);
      try { await lstat(finalPath); throw new Error(`File halaman sudah ada dan tidak akan ditimpa: ${path.basename(finalPath)}`); }
      catch (error) { if (error.code !== 'ENOENT') { await rm(saved.path, { force: true }).catch(() => {}); throw error; } }
      // link() is atomic and fails with EEXIST if another writer creates the
      // destination between the preflight and finalization steps.
      await link(saved.path, finalPath);
      await rm(saved.path, { force: true });
      totalBytes += saved.bytes;
      results.push({ page, path: finalPath, bytes: saved.bytes });
    }
  } catch (error) {
    await Promise.all(results.map(item => rm(item.path, { force: true }).catch(() => {})));
    throw error;
  }
  return {
    success: true,
    chapterSlug: parsed.slug,
    comicTitle: chapter.comicTitle || '',
    chapterNumber: chapter.chapterNumber || '',
    count: results.length,
    totalBytes,
    folder: realDestination,
    files: results,
    attribution: 'Westmanga scraper source supplied by the user’s friend; source preserved unchanged.',
  };
}

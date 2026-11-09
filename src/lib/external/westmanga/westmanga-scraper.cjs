/**
 * Westmanga Scraper & API Client
 * Target: https://v1.westmanga.my
 * Engine: Node.js (v18+ native fetch & node:crypto / zero external npm dependencies)
 */

const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');

// Service Configuration
const BASE_URL = 'https://v1.westmanga.my';
const IMAGE_MIRROR_URL = 'https://westmanga.site';

// Preset User-Agents
const USER_AGENTS = {
  desktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  android:
    'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  macos:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  ios:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
};

const DEFAULT_USER_AGENT = USER_AGENTS.desktop;

// In-Memory Token Cache
let cachedVisitToken = null;
let cachedTokenExpiresAt = 0;

/**
 * Derives Client Hints headers matching the provided User-Agent string.
 * @param {string} ua
 * @returns {Record<string, string>}
 */
function getClientHints(ua = DEFAULT_USER_AGENT) {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const hints = {
    'sec-ch-ua-mobile': isMobile ? '?1' : '?0'
  };

  if (/Android/i.test(ua)) {
    hints['sec-ch-ua-platform'] = '"Android"';
    const match = ua.match(/Chrome\/(\d+)/i);
    const ver = match ? match[1] : '131';
    hints['sec-ch-ua'] = `"Chromium";v="${ver}", "Not_A Brand";v="24"`;
  } else if (/Mac OS X|Macintosh/i.test(ua) && !/iPhone|iPad/i.test(ua)) {
    hints['sec-ch-ua-platform'] = '"macOS"';
    const match = ua.match(/Chrome\/(\d+)/i);
    const ver = match ? match[1] : '131';
    hints['sec-ch-ua'] = `"Chromium";v="${ver}", "Not_A Brand";v="24"`;
  } else if (/Windows/i.test(ua)) {
    hints['sec-ch-ua-platform'] = '"Windows"';
    const match = ua.match(/Chrome\/(\d+)/i);
    const ver = match ? match[1] : '131';
    hints['sec-ch-ua'] = `"Google Chrome";v="${ver}", "Chromium";v="${ver}", "Not_A Brand";v="24"`;
  }

  return hints;
}

/**
 * Obtains or refreshes the required X-WM-Visit token.
 * @param {object} [options]
 * @param {boolean} [options.forceRefresh=false]
 * @param {string} [options.userAgent]
 * @returns {Promise<string>}
 */
async function getVisitToken(options = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  if (!options.forceRefresh && cachedVisitToken && cachedTokenExpiresAt - nowSec > 120) {
    return cachedVisitToken;
  }

  const ua = options.userAgent || DEFAULT_USER_AGENT;
  const clientHints = getClientHints(ua);

  const res = await fetch(`${BASE_URL}/api/visit-token`, {
    headers: {
      'User-Agent': ua,
      'Accept': 'application/json, text/plain, */*',
      'Referer': `${BASE_URL}/`,
      'Origin': BASE_URL,
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      ...clientHints
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to obtain visit token: HTTP ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!data || !data.token) {
    throw new Error('Visit token response payload invalid');
  }

  cachedVisitToken = data.token;
  cachedTokenExpiresAt = Number(data.expires_at) || nowSec + 3600;
  return cachedVisitToken;
}

/**
 * Core HTTP Request Wrapper for Westmanga API
 * @param {string} endpoint - API path (e.g. /api/contents)
 * @param {object} [options]
 * @returns {Promise<any>}
 */
async function fetchApi(endpoint, options = {}) {
  const ua = options.userAgent || (options.preset && USER_AGENTS[options.preset]) || DEFAULT_USER_AGENT;
  const token = await getVisitToken({ userAgent: ua });
  const clientHints = getClientHints(ua);

  let url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
  if (options.params && Object.keys(options.params).length > 0) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(options.params)) {
      if (v !== undefined && v !== null && v !== '') {
        q.append(k, String(v));
      }
    }
    const qs = q.toString();
    if (qs) {
      url += (url.includes('?') ? '&' : '?') + qs;
    }
  }

  const referer = options.referer || `${BASE_URL}/`;

  const headers = {
    'User-Agent': ua,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
    'Origin': BASE_URL,
    'Referer': referer,
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'X-WM-Visit': token,
    ...clientHints,
    ...(options.headers || {})
  };

  let res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    redirect: 'follow'
  });

  // Handle Token Invalidation / 403 Retry
  if (res.status === 403 && res.headers.get('x-wm-visit-error')) {
    const freshToken = await getVisitToken({ userAgent: ua, forceRefresh: true });
    headers['X-WM-Visit'] = freshToken;
    res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  }

  if (!res.ok) {
    throw new Error(`Westmanga API error [${endpoint}]: HTTP ${res.status} ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Normalizes relative image URLs to absolute CDN URLs
 * @param {string} imgPath
 * @returns {string}
 */
function toAbsoluteImageUrl(imgPath) {
  if (!imgPath) return '';
  if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
    return imgPath;
  }
  return `${BASE_URL}${imgPath.startsWith('/') ? '' : '/'}${imgPath}`;
}

/**
 * Parses user input into a target slug and request type
 * @param {string} input - URL or bare slug
 * @returns {{ type: 'comic' | 'read' | 'search', slug: string }}
 */
function parseInputSlug(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Target input cannot be empty');
  }

  const cleaned = input.trim();

  // URL matching: /view/<chapter-slug>
  const viewMatch = cleaned.match(/\/view\/([^/?#]+)/i);
  if (viewMatch) {
    return { type: 'read', slug: viewMatch[1] };
  }

  // URL matching: /comic/<comic-slug>
  const comicMatch = cleaned.match(/\/comic\/([^/?#]+)/i);
  if (comicMatch) {
    return { type: 'comic', slug: comicMatch[1] };
  }

  // Bare slug heuristics
  if (cleaned.includes('-chapter-') || cleaned.endsWith('-ch-') || /-(ch|chapter)-\d+/i.test(cleaned)) {
    return { type: 'read', slug: cleaned };
  }

  return { type: 'comic', slug: cleaned };
}

/**
 * Fetches Home feed: latest releases, mirror updates, popular manga, and projects
 * @param {object} [options]
 * @returns {Promise<object>}
 */
async function getHome(options = {}) {
  const json = await fetchApi('/api/contents/home-data', {
    ...options,
    referer: `${BASE_URL}/`
  });

  const data = json.data || {};

  const normalizeList = (list = []) =>
    list.map(item => ({
      id: item.id,
      title: item.title,
      slug: item.slug,
      contentType: item.content_type || 'comic',
      cover: toAbsoluteImageUrl(item.cover),
      rating: item.rating || null,
      views: item.total_views || null,
      status: item.status || null,
      lastChapters: (item.lastChapters || []).map(ch => ({
        id: ch.id,
        number: ch.number,
        slug: ch.slug,
        updatedAt: ch.updated_at?.formatted || ''
      }))
    }));

  return {
    success: true,
    mirrorUpdates: normalizeList(data.mirror_update),
    popular: normalizeList(data.popular),
    newProjects: normalizeList(data.new_project),
    projectUpdates: normalizeList(data.project_update)
  };
}

/**
 * Searches manga directory with optional pagination and filters
 * @param {string} query - Keyword search
 * @param {object} [options]
 * @param {number} [options.page=1]
 * @param {number} [options.perPage=10]
 * @param {string} [options.sortBy]
 * @returns {Promise<object>}
 */
async function search(query = '', options = {}) {
  const page = options.page || 1;
  const perPage = options.perPage || options.limit || 10;

  const json = await fetchApi('/api/contents', {
    ...options,
    params: {
      q: query,
      page,
      per_page: perPage,
      sort_by: options.sortBy,
      order: options.order
    },
    referer: `${BASE_URL}/contents`
  });

  const rawList = Array.isArray(json.data) ? json.data : [];

  return {
    success: true,
    query,
    page,
    perPage,
    total: rawList.length,
    results: rawList.map(item => ({
      id: item.id,
      title: item.title,
      slug: item.slug,
      type: item.content_type || 'comic',
      cover: toAbsoluteImageUrl(item.cover),
      status: item.status || '',
      rating: item.rating || null,
      views: item.total_views || null,
      lastChapters: (item.lastChapters || []).map(ch => ({
        number: ch.number,
        slug: ch.slug,
        updatedAt: ch.updated_at?.formatted || ''
      }))
    }))
  };
}

/**
 * Retrieves full comic metadata, synopsis, and chapter list
 * @param {string} slug - Comic slug (e.g. 'cyberpunk-swordsman')
 * @param {object} [options]
 * @returns {Promise<object>}
 */
async function getComicDetail(slug, options = {}) {
  const cleanSlug = slug.trim();
  const json = await fetchApi(`/api/comic/${encodeURIComponent(cleanSlug)}`, {
    ...options,
    referer: `${BASE_URL}/comic/${cleanSlug}`
  });

  const d = json.data || {};

  return {
    success: true,
    id: d.id,
    title: d.title || '',
    alternativeName: d.alternative_name || null,
    slug: cleanSlug,
    cover: toAbsoluteImageUrl(d.cover),
    type: d.type || d.content_type || 'comic',
    status: d.status || '',
    synopsis: d.sinopsis || d.synopsis || '',
    author: d.author || '',
    artist: d.artist || '',
    genres: (d.genres || []).map(g => (typeof g === 'string' ? g : g.name || g.slug || '')),
    chaptersCount: (d.chapters || []).length,
    chapters: (d.chapters || []).map(ch => ({
      id: ch.id,
      number: ch.number,
      title: ch.title || `Chapter ${ch.number}`,
      slug: ch.slug,
      url: `${BASE_URL}/view/${ch.slug}`,
      releaseDate: ch.created_at?.formatted || ch.updated_at?.formatted || ''
    }))
  };
}

/**
 * Retrieves all chapter reading pages and image URLs
 * @param {string} chapterSlug - Chapter slug (e.g. 'cyberpunk-swordsman-chapter-06')
 * @param {object} [options]
 * @returns {Promise<object>}
 */
async function getChapterImages(chapterSlug, options = {}) {
  const cleanSlug = chapterSlug.trim();
  const json = await fetchApi(`/api/v/${encodeURIComponent(cleanSlug)}`, {
    ...options,
    referer: `${BASE_URL}/view/${cleanSlug}`
  });

  const d = json.data || {};
  const rawImages = Array.isArray(d.images) ? d.images : [];

  const images = rawImages.map((imgRel, idx) => ({
    page: idx + 1,
    path: imgRel,
    url: toAbsoluteImageUrl(imgRel),
    fallbackUrl: `${IMAGE_MIRROR_URL}${imgRel.startsWith('/') ? '' : '/'}${imgRel}`
  }));

  return {
    success: true,
    chapterNumber: d.number || '',
    chapterSlug: cleanSlug,
    comicTitle: d.comic_title || d.title || '',
    comicSlug: d.comic?.slug || '',
    imageCount: images.length,
    images,
    prevChapter: d.prev_chapter ? { slug: d.prev_chapter, url: `${BASE_URL}/view/${d.prev_chapter}` } : null,
    nextChapter: d.next_chapter ? { slug: d.next_chapter, url: `${BASE_URL}/view/${d.next_chapter}` } : null
  };
}

/**
 * Downloads a single media file to disk with stream pipeline
 * @param {string} url
 * @param {string} destPath
 * @param {object} [options]
 * @returns {Promise<string>}
 */
async function downloadFile(url, destPath, options = {}) {
  const ua = options.userAgent || DEFAULT_USER_AGENT;
  const res = await fetch(url, {
    headers: {
      'User-Agent': ua,
      'Referer': `${BASE_URL}/`
    }
  });

  if (!res.ok) {
    if (options.fallbackUrl) {
      return downloadFile(options.fallbackUrl, destPath, { ...options, fallbackUrl: null });
    }
    throw new Error(`Download failed with HTTP ${res.status}`);
  }

  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const dest = fs.createWriteStream(destPath);
  await pipeline(Readable.fromWeb(res.body), dest);
  return destPath;
}

/**
 * Downloads all images for a chapter into a structured folder
 * @param {string} chapterSlug
 * @param {object} [options]
 * @param {string} [options.outDir] - Destination root directory
 * @returns {Promise<{ chapterSlug: string, count: number, folder: string }>}
 */
async function downloadChapter(chapterSlug, options = {}) {
  const chapterData = await getChapterImages(chapterSlug, options);
  const outRoot = options.outDir || process.cwd();
  const folderName = `${chapterData.comicSlug || 'manga'}_${chapterSlug}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetDir = path.join(outRoot, folderName);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.log(`[+] Downloading ${chapterData.images.length} pages to: ${targetDir}`);

  for (const img of chapterData.images) {
    const ext = path.extname(img.path) || '.webp';
    const filename = `${String(img.page).padStart(3, '0')}${ext}`;
    const destPath = path.join(targetDir, filename);

    process.stdout.write(`    [${img.page}/${chapterData.images.length}] -> ${filename}\r`);
    await downloadFile(img.url, destPath, {
      userAgent: options.userAgent,
      fallbackUrl: img.fallbackUrl
    });
  }

  console.log(`\n[+] Chapter ${chapterData.chapterNumber} saved successfully (${chapterData.images.length} images).`);
  return {
    chapterSlug,
    count: chapterData.images.length,
    folder: targetDir
  };
}

// Module Exports
module.exports = {
  getVisitToken,
  fetchApi,
  getHome,
  search,
  getComicDetail,
  getChapterImages,
  downloadChapter,
  downloadFile,
  toAbsoluteImageUrl,
  parseInputSlug,
  BASE_URL,
  USER_AGENTS,
  DEFAULT_USER_AGENT
};

// CLI Execution Handler
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || args.includes('--help') || args.includes('-h')) {
    console.error('Usage: node westmanga_scraper.js <command|url> [options]');
    console.error('\nCommands:');
    console.error('  home                         Fetch latest updates and popular manga');
    console.error('  search <query>               Search manga catalog by keyword');
    console.error('  detail <comic-slug-or-url>   Get manga synopsis, authors, and chapter list');
    console.error('  read <chapter-slug-or-url>   Get chapter page image URLs');
    console.error('  download <chapter-slug-or-url> Download all chapter images to disk');
    console.error('\nDirect URL support:');
    console.error('  node westmanga_scraper.js https://v1.westmanga.my/comic/<slug>');
    console.error('  node westmanga_scraper.js https://v1.westmanga.my/view/<chapter-slug> [--save]');
    console.error('\nOptions:');
    console.error('  --save             Download chapter images to disk');
    console.error('  --out <dir>        Output directory for saved images (default: .)');
    console.error('  --json             Output raw JSON result only');
    console.error('  --page <num>       Page number for search (default: 1)');
    console.error('  --limit <num>      Items per page for search (default: 10)');
    console.error('  --preset <preset>  UA preset: desktop | android | macos | ios');
    console.error('  --user-agent <str> Custom User-Agent header');
    process.exit(1);
  }

  const isJson = args.includes('--json');
  const shouldSave = args.includes('--save') || command === 'download';

  const outIdx = args.indexOf('--out');
  const outDir = outIdx !== -1 ? args[outIdx + 1] : process.cwd();

  const pageIdx = args.indexOf('--page');
  const page = pageIdx !== -1 ? parseInt(args[pageIdx + 1], 10) : 1;

  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 10;

  const presetIdx = args.indexOf('--preset');
  const preset = presetIdx !== -1 ? args[presetIdx + 1] : undefined;

  const uaIdx = args.indexOf('--user-agent');
  const userAgent = uaIdx !== -1 ? args[uaIdx + 1] : undefined;

  const opts = { outDir, page, limit, preset, userAgent };

  (async () => {
    try {
      // 1. Direct URL or bare slug handling
      if (command.startsWith('http://') || command.startsWith('https://')) {
        const parsed = parseInputSlug(command);
        if (parsed.type === 'read') {
          if (shouldSave) {
            await downloadChapter(parsed.slug, opts);
          } else {
            const data = await getChapterImages(parsed.slug, opts);
            if (isJson) {
              console.log(JSON.stringify(data, null, 2));
            } else {
              console.log(`\n--- Chapter Read: ${data.chapterSlug} ---`);
              console.log(`Title        : ${data.comicTitle}`);
              console.log(`Chapter      : ${data.chapterNumber}`);
              console.log(`Total Pages  : ${data.imageCount}`);
              console.log('\nPage URLs:');
              data.images.slice(0, 10).forEach(img => {
                console.log(`  [Page ${img.page}] ${img.url}`);
              });
              if (data.imageCount > 10) {
                console.log(`  ... and ${data.imageCount - 10} more pages.`);
              }
              console.log('\n(Use --save to download all images to disk)');
            }
          }
        } else {
          const data = await getComicDetail(parsed.slug, opts);
          if (isJson) {
            console.log(JSON.stringify(data, null, 2));
          } else {
            console.log(`\n--- Comic Detail: ${data.title} ---`);
            console.log(`Slug         : ${data.slug}`);
            console.log(`Type         : ${data.type}`);
            console.log(`Status       : ${data.status}`);
            console.log(`Genres       : ${data.genres.join(', ') || '(none)'}`);
            console.log(`Total Chapters: ${data.chaptersCount}`);
            console.log(`\nSynopsis: \n${data.synopsis}\n`);
            console.log('Latest Chapters:');
            data.chapters.slice(0, 5).forEach(ch => {
              console.log(`  - [${ch.number}] ${ch.title} (${ch.releaseDate}) -> ${ch.url}`);
            });
          }
        }
        return;
      }

      // 2. Command: home
      if (command === 'home') {
        const data = await getHome(opts);
        if (isJson) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log('\n=== Westmanga Home Feed ===\n');
          console.log(`--- Latest Mirror Updates (${data.mirrorUpdates.length}) ---`);
          data.mirrorUpdates.slice(0, 5).forEach(m => {
            const latestCh = m.lastChapters[0] ? `Ch.${m.lastChapters[0].number}` : '';
            console.log(`  • ${m.title} [${m.slug}] (${latestCh})`);
          });

          console.log(`\n--- Popular Manga (${data.popular.length}) ---`);
          data.popular.slice(0, 5).forEach(m => {
            console.log(`  • ${m.title} [${m.slug}] (Rating: ${m.rating || 'N/A'})`);
          });
        }
        return;
      }

      // 3. Command: search
      if (command === 'search') {
        const query = args[1] || '';
        const data = await search(query, opts);
        if (isJson) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(`\n=== Search Results for "${query}" (${data.results.length}) ===\n`);
          data.results.forEach((m, idx) => {
            const latest = m.lastChapters[0] ? `Ch.${m.lastChapters[0].number}` : '';
            console.log(`  [${idx + 1}] ${m.title} (${m.type})`);
            console.log(`      Slug   : ${m.slug}`);
            console.log(`      Latest : ${latest}`);
            console.log(`      Cover  : ${m.cover}`);
          });
        }
        return;
      }

      // 4. Command: detail
      if (command === 'detail') {
        const slug = args[1];
        if (!slug) {
          console.error('[-] Error: Please specify a comic slug.');
          process.exit(1);
        }
        const data = await getComicDetail(slug, opts);
        if (isJson) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(`\n--- Comic Detail: ${data.title} ---`);
          console.log(`Slug         : ${data.slug}`);
          console.log(`Type         : ${data.type}`);
          console.log(`Status       : ${data.status}`);
          console.log(`Genres       : ${data.genres.join(', ') || '(none)'}`);
          console.log(`Total Chapters: ${data.chaptersCount}`);
          console.log(`Cover        : ${data.cover}`);
          console.log(`\nSynopsis: \n${data.synopsis}\n`);
          console.log('Chapters:');
          data.chapters.slice(0, 10).forEach(ch => {
            console.log(`  - [${ch.number}] ${ch.title} -> /view/${ch.slug}`);
          });
          if (data.chaptersCount > 10) {
            console.log(`  ... and ${data.chaptersCount - 10} more chapters.`);
          }
        }
        return;
      }

      // 5. Command: read
      if (command === 'read') {
        const slug = args[1];
        if (!slug) {
          console.error('[-] Error: Please specify a chapter slug.');
          process.exit(1);
        }
        if (shouldSave) {
          await downloadChapter(slug, opts);
        } else {
          const data = await getChapterImages(slug, opts);
          if (isJson) {
            console.log(JSON.stringify(data, null, 2));
          } else {
            console.log(`\n--- Chapter: ${data.chapterSlug} ---`);
            console.log(`Manga        : ${data.comicTitle}`);
            console.log(`Chapter      : ${data.chapterNumber}`);
            console.log(`Total Pages  : ${data.imageCount}`);
            console.log('\nPage URLs:');
            data.images.slice(0, 10).forEach(img => {
              console.log(`  [Page ${img.page}] ${img.url}`);
            });
            if (data.imageCount > 10) {
              console.log(`  ... and ${data.imageCount - 10} more pages.`);
            }
            console.log('\n(Use --save or "download" command to save images to disk)');
          }
        }
        return;
      }

      // 6. Command: download
      if (command === 'download') {
        const slug = args[1];
        if (!slug) {
          console.error('[-] Error: Please specify a chapter slug.');
          process.exit(1);
        }
        await downloadChapter(slug, opts);
        return;
      }

      console.error(`[-] Unknown command: ${command}`);
      process.exit(1);
    } catch (err) {
      console.error(`[-] Error: ${err.message}`);
      process.exit(1);
    }
  })();
}
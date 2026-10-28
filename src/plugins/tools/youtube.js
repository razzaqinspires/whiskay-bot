import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT = 180_000;
const MAX_UPLOAD_BYTES = 48 * 1024 * 1024;
const MAX_SEARCH_RESULTS = 25;

function clean(value, max = 180) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function isYouTubeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  return ['http:', 'https:'].includes(u.protocol) &&
    ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be'].includes(u.hostname.toLowerCase()) &&
    !u.username && !u.password;
}
function normalizeVideoUrl(raw) {
  if (!isYouTubeUrl(raw)) throw new Error('Masukkan URL YouTube yang valid (youtube.com atau youtu.be).');
  const u = new URL(raw);
  if (u.hostname.endsWith('youtu.be')) {
    const id = u.pathname.split('/').filter(Boolean)[0];
    if (!id) throw new Error('URL YouTube tidak memiliki ID video.');
    return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  }
  if (u.pathname === '/watch') {
    const id = u.searchParams.get('v');
    if (!id) throw new Error('URL YouTube tidak memiliki ID video.');
    return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  }
  if (/^\/(shorts|live|embed)\//.test(u.pathname)) return `https://www.youtube.com${u.pathname}`;
  throw new Error('Gunakan URL video YouTube, bukan URL channel atau playlist.');
}
async function runYtDlp(args, options = {}) {
  const candidates = [
    ['yt-dlp', args],
    ['python3', ['-m', 'yt_dlp', ...args]],
    ['python', ['-m', 'yt_dlp', ...args]],
    ['py', ['-m', 'yt_dlp', ...args]]
  ];
  let lastError;
  for (const [bin, argv] of candidates) {
    try {
      return await execFileAsync(bin, argv, {
        timeout: options.timeout || COMMAND_TIMEOUT,
        maxBuffer: options.maxBuffer || 8 * 1024 * 1024,
        windowsHide: true,
        ...options.execOptions
      });
    } catch (error) {
      lastError = error;
      if (error.code !== 'ENOENT') throw new Error(formatYtError(error));
    }
  }
  throw new Error('yt-dlp belum terpasang. Install yt-dlp dan FFmpeg di server, lalu restart bot.');
}
function formatYtError(error) {
  const raw = String(error?.stderr || error?.message || 'proses yt-dlp gagal');
  if (/ffmpeg.*not found|ffmpeg is not installed/i.test(raw)) return 'FFmpeg belum terpasang. Install FFmpeg agar konversi MP3 bisa dilakukan.';
  if (/private video|sign in|members-only|age-restricted|login required/i.test(raw)) return 'Video privat, dibatasi usia/login, atau tidak bisa diakses publik.';
  if (/requested format is not available|no video formats found|format .* not available/i.test(raw)) return 'Format video yang diminta tidak tersedia. Coba video publik lain atau perbarui yt-dlp; downloader sudah mencoba format gabungan dan fallback.';
  if (/unsupported url/i.test(raw)) return 'URL tidak didukung oleh yt-dlp.';
  if (/timed out|killed|timeout/i.test(raw)) return 'Proses terlalu lama dan dihentikan. Coba lagi nanti.';
  return clean(raw, 420) || 'Unduhan gagal. Coba URL lain atau perbarui yt-dlp.';
}
function formatDuration(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return 'durasi tidak diketahui';
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = Math.floor(n % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
async function searchVideos(query) {
  const { stdout } = await runYtDlp([
    '--dump-single-json', '--flat-playlist', '--no-warnings', '--no-call-home',
    '--skip-download', '--playlist-end', String(MAX_SEARCH_RESULTS), `ytsearch${MAX_SEARCH_RESULTS}:${query}`
  ], { timeout: 60_000, maxBuffer: 6 * 1024 * 1024 });
  let data;
  try { data = JSON.parse(stdout); } catch { throw new Error('Hasil pencarian tidak bisa dibaca. Coba kata kunci lain.'); }
  const entries = Array.isArray(data.entries) ? data.entries : [data];
  return entries.filter(v => v && (v.id || v.url)).slice(0, MAX_SEARCH_RESULTS).map(v => {
    const id = String(v.id || '').trim();
    const url = isYouTubeUrl(v.webpage_url || '') ? v.webpage_url : (id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : v.url);
    return { title: clean(v.title, 100) || 'Video YouTube', url, duration: formatDuration(v.duration), channel: clean(v.channel || v.uploader || v.channel_id, 60), thumbnail: clean(v.thumbnail || v.thumbnails?.at?.(-1)?.url || '', 500) };
  }).filter(v => isYouTubeUrl(v.url));
}
async function inspectVideo(rawUrl) {
  const url = normalizeVideoUrl(rawUrl);
  const { stdout } = await runYtDlp(['--dump-single-json','--no-warnings','--no-call-home','--skip-download','--no-playlist',url], { timeout: 45_000, maxBuffer: 6 * 1024 * 1024 });
  let info;
  try { info = JSON.parse(stdout); } catch { throw new Error('Metadata video tidak dapat dibaca.'); }
  return {
    url,
    title: clean(info.title, 160) || 'Video YouTube',
    channel: clean(info.channel || info.uploader, 90),
    duration: formatDuration(info.duration),
    thumbnail: clean(info.thumbnail || info.thumbnails?.at?.(-1)?.url || '', 500),
    views: Number.isFinite(Number(info.view_count)) ? Number(info.view_count).toLocaleString('id-ID') : '—',
    uploadDate: clean(info.upload_date || '', 8)
  };
}
const searchSessions = new Map();
const PAGE_SIZE = 10;
function searchSessionKey(ctx) { return `${ctx.chat || ''}:${ctx.sender || ctx.chat || ''}`; }
function getSearchSession(ctx) { return searchSessions.get(searchSessionKey(ctx)); }
function saveSearchSession(ctx, query, results, page = 0) {
  const key = searchSessionKey(ctx);
  const session = { query, results, page, updatedAt: Date.now() };
  searchSessions.set(key, session);
  // Bound memory: keep the most recent 100 chat/user sessions.
  while (searchSessions.size > 100) searchSessions.delete(searchSessions.keys().next().value);
  return session;
}
function buildSearchSections(ctx, results, page) {
  const start = page * PAGE_SIZE;
  const rows = results.slice(start, start + PAGE_SIZE).map((v, offset) => {
    const index = start + offset;
    return {
      title: `${String(index + 1).padStart(2, '0')}. ${clean(v.title, 70)}`.slice(0, 100),
      description: `${v.duration} · ${clean(v.channel || 'Channel tidak diketahui', 60)}`.slice(0, 100),
      id: `${ctx.prefix}ytpreview pick ${index + 1}`
    };
  });
  return [{ title: `Hasil ${start + 1}–${Math.min(start + rows.length, results.length)}`, rows }];
}
async function sendSearchResults(ctx, query, page = 0, existingResults = null) {
  const results = existingResults || await searchVideos(query);
  if (!results.length) return ctx.reply('Tidak ada hasil video publik yang ditemukan.');
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(pageCount - 1, Number(page) || 0));
  const session = saveSearchSession(ctx, query, results, safePage);
  const start = safePage * PAGE_SIZE;
  const pageResults = results.slice(start, start + PAGE_SIZE);
  const body = `Kata kunci: ${clean(query, 90)}\nHalaman ${safePage + 1}/${pageCount} · ${results.length} hasil\n\nPilih judul melalui tombol “Daftar Hasil”. Pratinjau akan menampilkan metadata dan pilihan MP3/MP4. Tidak ada file yang diunduh sebelum format dipilih.`;
  const buttons = [
    { name: 'quick_reply', title: 'Putar Hasil Pertama', id: `${ctx.prefix}ytmp3 ${results[0].url}` },
    { name: 'single_select', title: 'Daftar Hasil', sections: buildSearchSections(ctx, results, safePage) }
  ];
  if (safePage < pageCount - 1) buttons.push({ name: 'quick_reply', title: 'Hasil Berikutnya', id: `${ctx.prefix}ytpage ${safePage + 1}` });
  if (safePage > 0) buttons.push({ name: 'quick_reply', title: 'Halaman Sebelumnya', id: `${ctx.prefix}ytpage ${safePage - 1}` });
  // Keep quick replies within the native-flow button budget. The list is the primary picker.
  const normalizedButtons = buttons.filter(Boolean).slice(0, 3);
  try {
    return await ctx.sendInteractive({
      title: 'YouTube · Search Library',
      subtitle: `${results.length} hasil · halaman ${safePage + 1}/${pageCount}`,
      body,
      footer: 'Pilih hasil untuk membuka pratinjau · MP3/MP4 dipilih setelah pratinjau',
      buttons: normalizedButtons
    });
  } catch (error) {
    // The serializer's interactive helper has a text fallback. This explicit fallback
    // also keeps commands usable if the native-flow envelope fails before relay.
    const text = pageResults.map((v, i) => `${String(start + i + 1).padStart(2, '0')}. ${v.title}\n${v.duration} · ${v.channel || 'Channel tidak diketahui'}\n${ctx.prefix}ytpreview pick ${start + i + 1}`).join('\n\n');
    return ctx.reply(`YouTube · Search Library\n${body}\n\n${text}\n\nNavigasi: ${ctx.prefix}ytpage ${safePage + 1}`);
  }
}

async function sendVideoPreview(ctx, rawUrl) {
  const info = await inspectVideo(rawUrl);
  const date = info.uploadDate && /^\d{8}$/.test(info.uploadDate) ? `${info.uploadDate.slice(0,4)}-${info.uploadDate.slice(4,6)}-${info.uploadDate.slice(6,8)}` : '—';
  const body = `VIDEO PREVIEW\n${info.title}\n\nChannel: ${info.channel || 'Tidak diketahui'}\nDurasi: ${info.duration}\nViews: ${info.views}\nTanggal unggah: ${date}\n\nPilih format yang ingin kamu ambil. Bot belum mengunduh file sampai salah satu tombol format dipilih.`;
  return ctx.sendInteractive({
    image: info.thumbnail && /^https:\/\//i.test(info.thumbnail) ? { url: info.thumbnail } : undefined,
    title: 'YouTube · Video Preview', subtitle: info.channel || 'Sumber publik YouTube', body,
    footer: 'Pilih satu tindakan · tidak ada unduhan otomatis',
    buttons: [
      { name: 'quick_reply', title: '🎵 Ambil Audio MP3', id: `${ctx.prefix}ytmp3 ${info.url}` },
      { name: 'quick_reply', title: '🎬 Ambil Video MP4', id: `${ctx.prefix}ytmp4 ${info.url}` }
    ]
  });
}

export function buildMp4FormatArgs() {
  // Prefer separate video+audio streams up to 720p, then fall back to a combined
  // MP4 or any available format. YouTube frequently has no single-file MP4 at 720p.
  return ['-f', 'bv*[height<=720]+ba/b[height<=720]/b', '--merge-output-format', 'mp4'];
}

export async function sendDownloadedMedia(ctx, mode, buffer, caption) {
  const sock = ctx?.sock || ctx?.client;
  if (!sock || typeof sock.sendMessage !== 'function') throw new Error('Koneksi WhatsApp tidak tersedia (sock.sendMessage).');
  const jid = ctx.chat || ctx.sender;
  if (!jid) throw new Error('Tujuan chat WhatsApp tidak tersedia.');
  const content = mode === 'mp3' || mode === 'play'
    ? { audio: buffer, mimetype: 'audio/mpeg', fileName: 'whiskay-audio.mp3', ptt: false }
    : { video: buffer, mimetype: 'video/mp4', fileName: 'whiskay-video.mp4', caption };
  return sock.sendMessage(jid, content, ctx.raw ? { quoted: ctx.raw } : {});
}

async function downloadAndSend(ctx, rawUrl, mode) {
  const url = normalizeVideoUrl(rawUrl);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-yt-'));
  try {
    await ctx.reply(`⏳ Menyiapkan ${mode === 'mp3' ? 'audio MP3' : mode === 'play' ? 'audio untuk diputar' : 'video MP4'}...\nMohon tunggu.`);
    const output = path.join(tempDir, '%(title).100B-%(id)s.%(ext)s');
    const common = ['--no-playlist', '--no-warnings', '--no-progress', '--no-part', '--max-filesize', '48M', '--restrict-filenames', '-o', output];
    if (mode === 'mp3' || mode === 'play') {
      await runYtDlp([...common, '-x', '--audio-format', 'mp3', '--audio-quality', '5', url], { timeout: COMMAND_TIMEOUT, maxBuffer: 4 * 1024 * 1024 });
    } else {
      await runYtDlp([...common, ...buildMp4FormatArgs(), url], { timeout: COMMAND_TIMEOUT, maxBuffer: 4 * 1024 * 1024 });
    }
    const files = (await readdir(tempDir)).filter(f => !f.endsWith('.part') && !f.endsWith('.ytdl'));
    if (!files.length) throw new Error('File hasil tidak ditemukan. Video mungkin melebihi batas ukuran 48 MB atau formatnya tidak tersedia.');
    const filePath = path.join(tempDir, files[0]);
    const info = await stat(filePath);
    if (info.size > MAX_UPLOAD_BYTES) throw new Error('File melebihi batas pengiriman 48 MB. Pilih video/audio yang lebih pendek.');
    const buffer = await readFile(filePath);
    const caption = `🎬 ${clean(path.basename(filePath).replace(/-[^-]+\.[^.]+$/, '').replace(/_/g, ' '), 180)}\nSumber: YouTube`;
    await sendDownloadedMedia(ctx, mode, buffer, caption);
  } catch (error) {
    await ctx.reply(`❌ YouTube downloader gagal: ${clean(error?.message || error, 450)}`).catch(() => {});
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export default [
  {
    name: 'ytmp3', command: ['ytmp3'], menuCommands: ['ytmp3'], category: 'tools', cooldown: 12_000,
    description: 'Unduh audio YouTube menjadi MP3',
    async execute(ctx) {
      const raw = (ctx.args || []).join(' ').trim();
      if (!raw) return ctx.sendInteractive({ title: 'YouTube MP3', body: `Kirim URL video YouTube.\n\nContoh: ${ctx.prefix}ytmp3 https://youtu.be/VIDEO_ID`, footer: 'Maksimal file 48 MB; video harus dapat diakses publik.', buttons: [{ name: 'quick_reply', title: 'Cari Video', id: `${ctx.prefix}ytsearch ` }, { name: 'quick_reply', title: 'Bantuan YouTube', id: `${ctx.prefix}ythelp` }] });
      try { normalizeVideoUrl(raw); } catch (e) { return ctx.reply(e.message); }
      return downloadAndSend(ctx, raw, 'mp3');
    }
  },
  {
    name: 'ytmp4', command: ['ytmp4'], menuCommands: ['ytmp4'], category: 'tools', cooldown: 12_000,
    description: 'Unduh video YouTube menjadi MP4',
    async execute(ctx) {
      const raw = (ctx.args || []).join(' ').trim();
      if (!raw) return ctx.sendInteractive({ title: 'YouTube MP4', body: `Kirim URL video YouTube.\n\nContoh: ${ctx.prefix}ytmp4 https://youtu.be/VIDEO_ID`, footer: 'Video dibatasi hingga 720p dan maksimal 48 MB.', buttons: [{ name: 'quick_reply', title: 'Cari Video', id: `${ctx.prefix}ytsearch ` }, { name: 'quick_reply', title: 'Putar Audio', id: `${ctx.prefix}ytplay ` }] });
      try { normalizeVideoUrl(raw); } catch (e) { return ctx.reply(e.message); }
      return downloadAndSend(ctx, raw, 'mp4');
    }
  },
  {
    name: 'ytplay', command: ['ytplay'], menuCommands: ['ytplay'], category: 'tools', cooldown: 12_000,
    description: 'Cari video lalu kirim audionya',
    async execute(ctx) {
      const query = (ctx.args || []).join(' ').trim();
      if (!query) return ctx.sendInteractive({ title: 'YouTube Play', body: `Masukkan kata kunci untuk mencari audio.\n\nContoh: ${ctx.prefix}ytplay lagu santai`, footer: 'Mengunduh audio dari hasil pertama yang cocok.', buttons: [{ name: 'quick_reply', title: 'Cari & pilih hasil', id: `${ctx.prefix}ytsearch ` }] });
      if (isYouTubeUrl(query)) return sendVideoPreview(ctx, query);
      try {
        await ctx.reply('🔎 Mencari video YouTube...');
        return await sendSearchResults(ctx, query);
      } catch (e) { return ctx.reply(`❌ Pencarian YouTube gagal: ${clean(e.message, 400)}`); }
    }
  },
  {
    name: 'ytsearch', command: ['ytsearch'], menuCommands: ['ytsearch'], category: 'tools', cooldown: 8_000,
    description: 'Cari hingga 25 video YouTube dengan daftar native dan pratinjau',
    async execute(ctx) {
      const query = (ctx.args || []).join(' ').trim();
      if (!query) return ctx.sendInteractive({ title: 'YouTube Search', body: `Cari video dengan kata kunci.\n\nContoh: ${ctx.prefix}ytsearch tutorial robotika`, footer: 'Pilih judul melalui tombol Daftar Hasil untuk membuka pratinjau.', buttons: [{ name: 'quick_reply', title: 'Panduan YouTube', id: `${ctx.prefix}ythelp` }] });
      try {
        return await sendSearchResults(ctx, query);
      } catch (e) { return ctx.reply(`❌ Pencarian YouTube gagal: ${clean(e.message, 420)}`); }
    }
  },
  {
    name: 'ytpage', command: ['ytpage'], category: 'tools', cooldown: 2500,
    description: 'Navigasi halaman hasil pencarian YouTube yang aktif',
    async execute(ctx) {
      const args = ctx.args || [];
      const session = getSearchSession(ctx);
      if (!session) return ctx.sendInteractive({
        title: 'YouTube · Navigasi Hasil',
        body: `Belum ada pencarian aktif di chat ini. Jalankan ${ctx.prefix}ytsearch kata kunci terlebih dahulu.`,
        buttons: [{ name: 'quick_reply', title: 'Buka Pencarian YouTube', id: `${ctx.prefix}ythelp` }]
      });
      const pageCount = Math.max(1, Math.ceil(session.results.length / PAGE_SIZE));
      let page;
      if (!args.length || args[0].toLowerCase() === 'next') page = session.page + 1;
      else if (args[0].toLowerCase() === 'prev' || args[0].toLowerCase() === 'back') page = session.page - 1;
      else page = Number(args[0]);
      if (!Number.isInteger(page) || page < 0 || page >= pageCount) {
        const buttons = [];
        if (session.page > 0) buttons.push({ name: 'quick_reply', title: 'Halaman Sebelumnya', id: `${ctx.prefix}ytpage ${session.page - 1}` });
        if (session.page < pageCount - 1) buttons.push({ name: 'quick_reply', title: 'Hasil Berikutnya', id: `${ctx.prefix}ytpage ${session.page + 1}` });
        return ctx.sendInteractive({ title: 'Navigasi YouTube', body: `Halaman aktif ${session.page + 1}/${pageCount}. Pilih halaman yang tersedia.`, buttons });
      }
      return sendSearchResults(ctx, session.query, page, session.results);
    }
  },
  {
    name: 'ytpreview', command: ['ytpreview'], category: 'tools', cooldown: 2500,
    description: 'Tampilkan pratinjau video YouTube dan pilihan format',
    async execute(ctx) {
      const args = ctx.args || [];
      if (args[0] === 'pick') {
        const session = getSearchSession(ctx);
        const number = Number(args[1]);
        if (!session) return ctx.reply(`Sesi pencarian tidak ditemukan. Jalankan ${ctx.prefix}ytsearch kata kunci lagi, lalu pilih hasil dari tombol Daftar Hasil.`);
        if (!Number.isInteger(number) || number < 1 || number > session.results.length) return ctx.reply(`Nomor hasil tidak valid. Pilih nomor 1–${session.results.length} dari daftar pencarian terakhir.`);
        const picked = session.results[number - 1];
        return sendVideoPreview(ctx, picked.url);
      }
      const raw = args.join(' ').trim();
      if (!raw) {
        const session = getSearchSession(ctx);
        if (session) return sendSearchResults(ctx, session.query, session.page, session.results);
        return ctx.sendInteractive({ title: 'YouTube · Pratinjau', body: `Kirim URL video, atau jalankan ${ctx.prefix}ytsearch kata kunci untuk menampilkan daftar hasil yang dapat dipilih.`, buttons: [{ name: 'quick_reply', title: 'Panduan YouTube', id: `${ctx.prefix}ythelp` }] });
      }
      try { return await sendVideoPreview(ctx, raw); }
      catch (e) { return ctx.reply(`❌ Pratinjau YouTube gagal: ${clean(e?.message || e, 400)}`); }
    }
  },
  {
    name: 'ythelp', command: ['ythelp'], menuCommands: ['ythelp'], category: 'tools', cooldown: 3_000,
    description: 'Bantuan perintah YouTube downloader',
    async execute(ctx) {
      return ctx.sendInteractive({ title: 'WhiskayBot · YouTube Tools', body: `• ${ctx.prefix}ytmp3 URL — unduh audio MP3\n• ${ctx.prefix}ytmp4 URL — unduh video MP4\n• ${ctx.prefix}ytplay query — cari lalu kirim audio\n• ${ctx.prefix}ytsearch query — cari video dan pilih hasil melalui Daftar Hasil\n\nContoh:\n${ctx.prefix}ytsearch lagu Indonesia\n${ctx.prefix}ytplay lofi study\n${ctx.prefix}ytmp3 https://youtu.be/VIDEO_ID\n${ctx.prefix}ytmp4 https://youtu.be/VIDEO_ID`, footer: 'Perlu yt-dlp dan FFmpeg terpasang di server. Batas file 48 MB; hanya video publik yang dapat diakses.', buttons: [{ name: 'quick_reply', title: 'Cari YouTube', id: `${ctx.prefix}ytsearch ` }, { name: 'quick_reply', title: 'Contoh Putar', id: `${ctx.prefix}ytplay lofi study` }] });
    }
  }
];

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT = 180_000;
const MAX_UPLOAD_BYTES = 48 * 1024 * 1024;
const MAX_SEARCH_RESULTS = 5;

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
    return { title: clean(v.title, 100) || 'Video YouTube', url, duration: formatDuration(v.duration), channel: clean(v.channel || v.uploader || v.channel_id, 60) };
  }).filter(v => isYouTubeUrl(v.url));
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
      await runYtDlp([...common, '-f', 'best[ext=mp4][height<=720]/best[height<=720][ext=mp4]/best[height<=720]', '--merge-output-format', 'mp4', url], { timeout: COMMAND_TIMEOUT, maxBuffer: 4 * 1024 * 1024 });
    }
    const files = (await readdir(tempDir)).filter(f => !f.endsWith('.part') && !f.endsWith('.ytdl'));
    if (!files.length) throw new Error('File hasil tidak ditemukan. Video mungkin melebihi batas ukuran 48 MB atau formatnya tidak tersedia.');
    const filePath = path.join(tempDir, files[0]);
    const info = await stat(filePath);
    if (info.size > MAX_UPLOAD_BYTES) throw new Error('File melebihi batas pengiriman 48 MB. Pilih video/audio yang lebih pendek.');
    const buffer = await readFile(filePath);
    const caption = `🎬 ${clean(path.basename(filePath).replace(/-[^-]+\.[^.]+$/, '').replace(/_/g, ' '), 180)}\nSumber: YouTube`;
    if (mode === 'mp3' || mode === 'play') {
      await ctx.send({ audio: buffer, mimetype: 'audio/mpeg', fileName: 'whiskay-audio.mp3', ptt: false });
    } else {
      await ctx.send({ video: buffer, mimetype: 'video/mp4', fileName: 'whiskay-video.mp4', caption });
    }
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
      if (isYouTubeUrl(query)) return downloadAndSend(ctx, query, 'play');
      try {
        await ctx.reply('🔎 Mencari video YouTube...');
        const results = await searchVideos(query);
        if (!results.length) return ctx.reply('Tidak ada hasil video yang ditemukan.');
        return downloadAndSend(ctx, results[0].url, 'play');
      } catch (e) { return ctx.reply(`❌ Pencarian YouTube gagal: ${clean(e.message, 400)}`); }
    }
  },
  {
    name: 'ytsearch', command: ['ytsearch'], menuCommands: ['ytsearch'], category: 'tools', cooldown: 8_000,
    description: 'Cari video YouTube dengan tombol pilihan',
    async execute(ctx) {
      const query = (ctx.args || []).join(' ').trim();
      if (!query) return ctx.sendInteractive({ title: 'YouTube Search', body: `Cari video dengan kata kunci.\n\nContoh: ${ctx.prefix}ytsearch tutorial robotika`, footer: 'Pilih hasil melalui daftar tombol.', buttons: [{ name: 'quick_reply', title: 'Panduan YouTube', id: `${ctx.prefix}ythelp` }] });
      try {
        const results = await searchVideos(query);
        if (!results.length) return ctx.reply('Tidak ada hasil video yang ditemukan.');
        const rows = results.map((v, i) => ({ title: `${i + 1}. ${v.title}`.slice(0, 72), description: `${v.duration}${v.channel ? ` · ${v.channel}` : ''}`.slice(0, 72), id: `${ctx.prefix}ytplay ${v.url}` }));
        return ctx.sendInteractive({ title: 'Hasil YouTube', subtitle: `Kata kunci: ${clean(query, 100)}`, body: 'Pilih video di daftar untuk mengunduh dan mengirim audionya. Untuk video MP4, pilih hasil lalu gunakan URL-nya dengan .ytmp4.', footer: 'Hasil publik dari YouTube · pilih satu video', buttons: [{ name: 'quick_reply', title: 'Putar hasil pertama', id: `${ctx.prefix}ytplay ${results[0].url}` }, { name: 'quick_reply', title: 'Audio MP3 hasil pertama', id: `${ctx.prefix}ytmp3 ${results[0].url}` }, { name: 'single_select', title: 'Pilih Video', sections: [{ title: 'Hasil pencarian', rows }] }] });
      } catch (e) { return ctx.reply(`❌ Pencarian YouTube gagal: ${clean(e.message, 420)}`); }
    }
  },
  {
    name: 'ythelp', command: ['ythelp'], menuCommands: ['ythelp'], category: 'tools', cooldown: 3_000,
    description: 'Bantuan perintah YouTube downloader',
    async execute(ctx) {
      return ctx.sendInteractive({ title: 'WhiskayBot · YouTube Tools', body: `• ${ctx.prefix}ytmp3 URL — unduh audio MP3\n• ${ctx.prefix}ytmp4 URL — unduh video MP4\n• ${ctx.prefix}ytplay query — cari lalu kirim audio\n• ${ctx.prefix}ytsearch query — cari video dengan tombol pilihan\n\nContoh:\n${ctx.prefix}ytsearch lagu Indonesia\n${ctx.prefix}ytplay lofi study\n${ctx.prefix}ytmp3 https://youtu.be/VIDEO_ID\n${ctx.prefix}ytmp4 https://youtu.be/VIDEO_ID`, footer: 'Perlu yt-dlp dan FFmpeg terpasang di server. Batas file 48 MB; hanya video publik yang dapat diakses.', buttons: [{ name: 'quick_reply', title: 'Cari YouTube', id: `${ctx.prefix}ytsearch ` }, { name: 'quick_reply', title: 'Contoh Putar', id: `${ctx.prefix}ytplay lofi study` }] });
    }
  }
];

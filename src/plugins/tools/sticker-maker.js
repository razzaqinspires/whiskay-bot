import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 10;
const timeoutMs = 45_000;
function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 5000) stderr = stderr.slice(-5000); });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(stderr.includes('ENOENT') ? `${bin} belum terpasang.` : `${bin} gagal memproses media.`)); });
  });
}
function unwrap(message) {
  let current = message?.message || message || {};
  for (let i = 0; i < 8; i++) {
    const next = current.ephemeralMessage?.message || current.viewOnceMessage?.message || current.viewOnceMessageV2?.message || current.documentWithCaptionMessage?.message;
    if (!next) break;
    current = next;
  }
  return current;
}
function exifPayload(packname, author) {
  const json = Buffer.from(JSON.stringify({ 'sticker-pack-id': 'com.whiskay.stickers', 'sticker-pack-name': packname, 'sticker-pack-publisher': author, emojis: ['✨'] }));
  const header = Buffer.from([0x49,0x49,0x2a,0x00,0x08,0x00,0x00,0x00,0x01,0x00,0x41,0x57,0x07,0x00,0x00,0x00,0x00,0x00,0x16,0x00,0x00,0x00]);
  header.writeUInt32LE(json.length, 14);
  return Buffer.concat([header, json]);
}
export default {
  name: 'sticker-maker', command: ['s', 'sticker'], category: 'tools', cooldown: 5000,
  description: 'Ubah gambar atau video pendek yang direply menjadi stiker WebP',
  async execute(ctx) {
    const target = ctx.quoted || (ctx.media?.hasMedia ? ctx.raw : null);
    if (!target) return ctx.reply('Balas/reply gambar atau video pendek dengan `.s` atau `.sticker`.');
    const message = unwrap(target);
    const image = message.imageMessage, video = message.videoMessage;
    if (!image && !video) return ctx.reply('Media harus berupa gambar atau video. Dokumen, audio, dan pesan teks tidak didukung.');
    if (video && Number(video.seconds || 0) > MAX_VIDEO_SECONDS) return ctx.reply(`Video terlalu panjang. Maksimal ${MAX_VIDEO_SECONDS} detik.`);
    try {
      const input = await ctx.download(target);
      if (!input?.length) throw new Error('Media tidak berhasil diunduh. Coba kirim ulang lalu reply pesannya.');
      if (input.length > MAX_INPUT_BYTES) throw new Error('Ukuran media melebihi 20 MB.');
      const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-sticker-'));
      try {
        const src = path.join(dir, video ? 'input.mp4' : 'input.img');
        const out = path.join(dir, 'sticker.webp');
        const exif = path.join(dir, 'sticker.exif');
        await writeFile(src, input);
        const args = video
          ? ['-y','-i',src,'-t',String(MAX_VIDEO_SECONDS),'-vf','fps=12,scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=yuva420p','-loop','0','-an','-vsync','0','-c:v','libwebp','-quality','78','-compression_level','4',out]
          : ['-y','-i',src,'-frames:v','1','-vf','scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=yuva420p','-c:v','libwebp','-quality','82','-compression_level','4',out];
        await run('ffmpeg', args);
        const pack = String(process.env.STICKER_PACK_NAME || 'WHISKAY RPG').slice(0, 64);
        const author = String(process.env.STICKER_AUTHOR || 'WHISKAY BOT').slice(0, 64);
        await writeFile(exif, exifPayload(pack, author));
        try { await run('webpmux', ['-set','exif',exif,out,'-o',path.join(dir,'tagged.webp')]); }
        catch { /* webpmux is optional; ffmpeg WebP still works without embedded pack metadata */ }
        const tagged = path.join(dir, 'tagged.webp');
        let output;
        try { output = await readFile(tagged); } catch { output = await readFile(out); }
        if (!output.length || output.length > 1024 * 1024) throw new Error('Hasil stiker kosong atau melebihi batas 1 MB.');
        await ctx.send({ sticker: output });
      } finally { await rm(dir, { recursive: true, force: true }); }
    } catch (error) {
      console.error('[STICKER] conversion failed:', error?.message || error);
      return ctx.reply(`⚠️ Stiker gagal dibuat: ${String(error?.message || 'media tidak dapat diproses').slice(0, 180)}\nPastikan FFmpeg terpasang; webpmux opsional untuk metadata pack.`);
    }
  }
};

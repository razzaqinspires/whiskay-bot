import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const BASE_DIR = path.resolve('data/saved-images');

function unwrapMessage(message) {
  let current = message?.message || message || {};
  for (let i = 0; i < 8; i++) {
    const next = current.ephemeralMessage?.message
      || current.viewOnceMessage?.message
      || current.viewOnceMessageV2?.message
      || current.viewOnceMessageV2Extension?.message
      || current.documentWithCaptionMessage?.message;
    if (!next) break;
    current = next;
  }
  return current;
}

function extensionFor(mime) {
  const value = String(mime || '').toLowerCase().split(';')[0].trim();
  if (value === 'image/png') return 'png';
  if (value === 'image/webp') return 'webp';
  if (value === 'image/gif') return 'gif';
  if (value === 'image/jpeg' || value === 'image/jpg') return 'jpg';
  return '';
}

function safeFilename(input, ext) {
  let name = String(input || '').trim();
  if (!name) name = `image-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  name = name.replace(/\\/g, '/').split('/').pop().replace(/\.[^.]*$/, '');
  name = name.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80);
  if (!name || name === '.' || name === '..') throw new Error('Nama file tidak valid. Gunakan huruf, angka, titik, garis bawah, atau tanda hubung.');
  return `${name}.${ext}`;
}

export const saveImagePathInternals = { unwrapMessage, extensionFor, safeFilename, MAX_IMAGE_BYTES };

export default {
  name: 'owner-save-image-path',
  command: ['saveimg', 'saveimage', 'saveimagepath'],
  aliases: ['imgsave'],
  category: 'owner',
  owner: true,
  energyMode: 'free',
  energyCost: 0,
  cooldown: 1500,
  description: 'Simpan gambar WhatsApp ke data/saved-images dan tampilkan path lokal (owner only)',
  async execute(ctx) {
    if (!ctx.isOwner) return ctx.reply('🔒 Perintah ini khusus owner bot.');

    const target = ctx.quoted || (ctx.media?.type === 'imageMessage' || ctx.media?.hasMedia ? ctx.raw : null);
    if (!target) return ctx.reply(`Reply gambar dengan ${ctx.prefix || '.'}saveimg [nama-file], atau kirim gambar dengan caption perintah tersebut.`);

    const message = unwrapMessage(target);
    const image = message.imageMessage;
    if (!image) return ctx.reply('❌ Pesan yang dipilih bukan gambar. Reply gambar asli, bukan stiker, video, atau dokumen.');

    const ext = extensionFor(image.mimetype || 'image/jpeg');
    if (!ext) return ctx.reply('❌ Format gambar tidak didukung. Gunakan JPEG, PNG, WebP, atau GIF.');

    let filename;
    try { filename = safeFilename(ctx.args?.join(' '), ext); }
    catch (error) { return ctx.reply(`❌ ${error.message}`); }

    let buffer;
    try { buffer = await ctx.download(target); }
    catch { return ctx.reply('❌ Gagal mengunduh gambar dari WhatsApp. Coba kirim ulang lalu ulangi perintah.'); }
    if (!buffer?.length) return ctx.reply('❌ Data gambar kosong atau gagal diunduh.');
    if (buffer.length > MAX_IMAGE_BYTES) return ctx.reply(`❌ Gambar melebihi batas ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);

    const destination = path.resolve(BASE_DIR, filename);
    if (!destination.startsWith(`${BASE_DIR}${path.sep}`)) return ctx.reply('❌ Path file tidak valid.');

    try {
      await mkdir(BASE_DIR, { recursive: true });
      await writeFile(destination, buffer, { flag: 'wx' });
    } catch (error) {
      if (error?.code === 'EEXIST') return ctx.reply(`⚠️ File sudah ada dan tidak ditimpa: data/saved-images/${filename}\nGunakan nama lain.`);
      return ctx.reply(`❌ Gagal menyimpan gambar: ${String(error?.message || error).slice(0, 180)}`);
    }

    return ctx.reply(`✅ Gambar berhasil disimpan.\nPath relatif: data/saved-images/${filename}\nPath absolut: ${destination}\nUkuran: ${(buffer.length / 1024).toFixed(1)} KB`);
  },
};

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMenuSettings, updateMenuSettings } from '../lib/menu-settings.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIGURED_ROOT = process.env.WHISKAY_DATA_DIR;
const DATA_ROOT = CONFIGURED_ROOT ? (path.isAbsolute(CONFIGURED_ROOT) ? CONFIGURED_ROOT : path.resolve(PROJECT_ROOT, CONFIGURED_ROOT)) : path.join(PROJECT_ROOT, 'data');
const MAX_BYTES = 8 * 1024 * 1024;
const unwrap = message => {
  let current = message || {};
  for (let i = 0; i < 8; i++) {
    const nested = current.ephemeralMessage?.message || current.viewOnceMessage?.message || current.viewOnceMessageV2?.message || current.viewOnceMessageV2Extension?.message || current.documentWithCaptionMessage?.message;
    if (!nested) break;
    current = nested;
  }
  return current;
};

/** Consume a one-time image reply to the user's explicit Canvas V2 upload prompt. */
export async function consumePendingMenuAvatar(ctx) {
  if (!ctx?.sender || !ctx?.quoted || ctx.type !== 'imageMessage') return false;
  const settings = await getMenuSettings(ctx.sender);
  const quotedId = String(ctx.quoted.key?.id || ctx.quoted.id || '');
  if (!settings.canvasAvatarPendingId || quotedId !== String(settings.canvasAvatarPendingId)) return false;
  const createdAt = Number(settings.canvasAvatarPendingAt || 0);
  if (!createdAt || Date.now() - createdAt > 15 * 60 * 1000) {
    await updateMenuSettings(ctx.sender, { canvasAvatarPendingId: '', canvasAvatarPendingAt: 0 });
    await ctx.reply('Sesi unggah avatar sudah kedaluwarsa. Tekan tombol Unggah Avatar lagi.').catch(() => {});
    return true;
  }
  const message = unwrap(ctx.message || {});
  const mime = String(message.imageMessage?.mimetype || ctx.msg?.mimetype || 'image/jpeg').toLowerCase();
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) {
    await ctx.reply('Format avatar harus JPG, PNG, atau WEBP. Tekan tombol unggah untuk mencoba lagi.').catch(() => {});
    return true;
  }
  const buffer = await ctx.download().catch(() => null);
  if (!buffer?.length || buffer.length > MAX_BYTES) {
    await ctx.reply('Gambar gagal diunduh atau melebihi batas 8 MB. Tekan tombol unggah untuk mencoba lagi.').catch(() => {});
    return true;
  }
  const validSignature = mime.includes('png') ? buffer.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) : mime.includes('jpeg') ? buffer[0]===0xff && buffer[1]===0xd8 : buffer.subarray(0,4).toString('ascii')==='RIFF' && buffer.subarray(8,12).toString('ascii')==='WEBP';
  if (!validSignature) { await ctx.reply('Isi file tidak cocok dengan format gambar yang dikirim.').catch(() => {}); return true; }
  const dir = path.join(DATA_ROOT, 'menu-images');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const safeId = String(ctx.sender).replace(/[^a-zA-Z0-9_-]/g, '_');
  const dest = path.join(dir, `avatar-${safeId}.${ext}`);
  await writeFile(dest, buffer, { mode: 0o600 });
  await updateMenuSettings(ctx.sender, { canvasAvatarPath: dest, canvasAvatarSource: 'custom', canvasAvatarPendingId: '', canvasAvatarPendingAt: 0 });
  await ctx.sendInteractive({
    title: 'Avatar Canvas V2 Berhasil Diterapkan',
    body: 'Foto/logo sudah otomatis tersimpan dari balasan gambar ini. Area lingkaran pada kartu landscape V2 akan memakai gambar baru.',
    buttons: [
      { name: 'quick_reply', title: 'Preview Canvas V2', id: '.setmenu image menu-v2' },
      { name: 'quick_reply', title: 'Lihat Menu', id: '.menu' },
      { name: 'quick_reply', title: 'Ganti Avatar', id: '.setmenu image avatar-upload' }
    ]
  }).catch(() => {});
  return true;
}

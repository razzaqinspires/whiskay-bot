import { sendDownloadChoices } from '../../services/mediaDownloader.js';

export default {
  name: 'tiktok-dl',
  command: ['tiktok'],
  aliases: ['ttdl'],
  category: 'downloader',
  description: 'Pilih format unduhan tiktok melalui tombol interaktif',
  cooldown: 2500,
  async execute(ctx) {
    const raw = String(ctx.args?.[0] || '').trim();
    if (!raw) return ctx.reply(`Gunakan: ${ctx.prefix || '.'}tiktok https://...\nKirim tautan publik yang boleh kamu unduh.`);
    try {
      await sendDownloadChoices(ctx, 'tiktok', raw);
    } catch (error) {
      return ctx.reply(`⚠️ Downloader belum berhasil memproses tautan. ${String(error?.message || 'Coba lagi nanti.').slice(0, 220)}`);
    }
  },
};

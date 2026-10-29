import { sendDownloadChoices } from '../../services/mediaDownloader.js';

export default {
  name: 'ig-dl',
  command: ['ig'],
  aliases: ['igdl','instagram','instagramdl'],
  category: 'downloader',
  description: 'Pilih format unduhan instagram melalui tombol interaktif',
  cooldown: 2500,
  async execute(ctx) {
    const raw = String(ctx.args?.[0] || '').trim();
    if (!raw) return ctx.reply(`Gunakan: ${ctx.prefix || '.'}ig https://...\nKirim tautan publik yang boleh kamu unduh.`);
    try {
      await sendDownloadChoices(ctx, 'instagram', raw);
    } catch (error) {
      return ctx.reply(`⚠️ Downloader belum berhasil memproses tautan. ${String(error?.message || 'Coba lagi nanti.').slice(0, 220)}`);
    }
  },
};

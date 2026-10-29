import { sendDownloadChoices } from '../../services/mediaDownloader.js';

export default {
  name: "mediafire-dl",
  command: ["mediafire"],
  aliases: ["mediafiredl", "mf"],
  category: 'downloader',
  description: "Pilih format unduhan MediaFire melalui pilihan interaktif",
  cooldown: 2500,
  async execute(ctx) {
    const raw = String(ctx.args?.[0] || '').trim();
    if (!raw) return ctx.reply(`Gunakan: ${ctx.prefix || '.'}mediafire https://...\nKirim tautan publik yang boleh kamu unduh.`);
    try {
      await sendDownloadChoices(ctx, "mediafire", raw);
    } catch (error) {
      return ctx.reply(`⚠️ Downloader MediaFire belum berhasil memproses tautan. ${String(error?.message || 'Coba lagi nanti.').slice(0, 220)}`);
    }
  },
};

import { sendDownloadChoices } from '../../services/mediaDownloader.js';

export default {
  name: "rednote-dl",
  command: ["rednote"],
  aliases: ["renotedl", "xiaohongshu"],
  category: 'downloader',
  description: "Pilih format unduhan RedNote / Xiaohongshu melalui pilihan interaktif",
  cooldown: 2500,
  async execute(ctx) {
    const raw = String(ctx.args?.[0] || '').trim();
    if (!raw) return ctx.reply(`Gunakan: ${ctx.prefix || '.'}rednote https://...\nKirim tautan publik yang boleh kamu unduh.`);
    try {
      await sendDownloadChoices(ctx, "rednote", raw);
    } catch (error) {
      return ctx.reply(`⚠️ Downloader RedNote / Xiaohongshu belum berhasil memproses tautan. ${String(error?.message || 'Coba lagi nanti.').slice(0, 220)}`);
    }
  },
};

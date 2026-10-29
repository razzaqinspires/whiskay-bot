import { sendDownloadChoices } from '../../services/mediaDownloader.js';

export default {
  name: "pinterest-dl",
  command: ["pinterestdl"],
  aliases: ["pindl", "pinterest"],
  category: 'downloader',
  description: "Pilih format unduhan Pinterest melalui pilihan interaktif",
  cooldown: 2500,
  async execute(ctx) {
    const raw = String(ctx.args?.[0] || '').trim();
    if (!raw) return ctx.reply(`Gunakan: ${ctx.prefix || '.'}$pinterestdl https://...\nKirim tautan publik yang boleh kamu unduh.`);
    try {
      await sendDownloadChoices(ctx, "pinterest", raw);
    } catch (error) {
      return ctx.reply(`⚠️ Downloader Pinterest belum berhasil memproses tautan. ${String(error?.message || 'Coba lagi nanti.').slice(0, 220)}`);
    }
  },
};

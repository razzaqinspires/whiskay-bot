import { sendDownloadChoices } from '../../services/mediaDownloader.js';

export default {
  name: "spotify-dl",
  command: ["spotify"],
  aliases: ["spotdl", "spodl"],
  category: 'downloader',
  description: "Pilih format unduhan Spotify melalui pilihan interaktif",
  cooldown: 2500,
  async execute(ctx) {
    const raw = String(ctx.args?.[0] || '').trim();
    if (!raw) return ctx.reply(`Gunakan: ${ctx.prefix || '.'}spotify https://...\nKirim tautan publik yang boleh kamu unduh.`);
    try {
      await sendDownloadChoices(ctx, "spotify", raw);
    } catch (error) {
      return ctx.reply(`⚠️ Downloader Spotify belum berhasil memproses tautan. ${String(error?.message || 'Coba lagi nanti.').slice(0, 220)}`);
    }
  },
};

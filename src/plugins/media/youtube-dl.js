import { sendDownloadChoices } from '../../services/mediaDownloader.js';

export default {
  name: "youtube-dl",
  command: ["ytmp4"],
  aliases: ["youtube", "ytdl", "youtubedl", "youtubedownloader"],
  category: 'downloader',
  description: "Pilih format unduhan YouTube melalui pilihan interaktif",
  cooldown: 2500,
  async execute(ctx) {
    const raw = String(ctx.args?.[0] || '').trim();
    if (!raw) return ctx.reply(`Gunakan: ${ctx.prefix || '.'}ytmp4 https://...\nKirim tautan publik yang boleh kamu unduh.`);
    try {
      await sendDownloadChoices(ctx, "youtube", raw);
    } catch (error) {
      return ctx.reply(`⚠️ Downloader YouTube belum berhasil memproses tautan. ${String(error?.message || 'Coba lagi nanti.').slice(0, 220)}`);
    }
  },
};

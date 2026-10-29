import { takePending } from '../../services/mediaDownloader.js';
const labels = { hd: 'Video HD', sd: 'Video SD', audio: 'Audio' };
export default {
  name: 'dl-select', command: ['dlselect'], aliases: ['dl-select'], category: 'downloader', description: 'Kirim format downloader yang dipilih', cooldown: 1500,
  async execute(ctx) {
    const token = String(ctx.args?.[0] || ''); const format = String(ctx.args?.[1] || '').toLowerCase();
    if (!token || !['hd','sd','audio'].includes(format)) return ctx.reply('Pilihan unduhan tidak valid atau sudah kedaluwarsa. Jalankan command downloader lagi.');
    const item = takePending(token, ctx.sender, ctx.chat, format);
    if (!item) return ctx.reply('⏳ Pilihan ini sudah kedaluwarsa atau berasal dari pengguna lain. Jalankan command downloader lagi.');
    const mediaUrl = format === 'hd' ? item.media.videoHD : format === 'sd' ? item.media.videoSD : item.media.audio;
    if (!mediaUrl) return ctx.reply('Format tersebut tidak tersedia untuk tautan ini.');
    try {
      const caption = `✅ *${item.media.title}*\nFormat: *${labels[format]}*\nSumber: ${item.platform}`;
      if (format === 'audio') await ctx.send({ audio: { url: mediaUrl }, mimetype: 'audio/mpeg', fileName: `${item.platform}-audio.mp3`, caption });
      else await ctx.send({ video: { url: mediaUrl }, mimetype: 'video/mp4', caption });
    } catch {
      return ctx.reply(`⚠️ Gagal mengirim ${labels[format]}. Coba lagi atau gunakan tautan sumber: ${item.media.url}`);
    }
  }
};

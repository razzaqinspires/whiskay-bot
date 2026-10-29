import { downloadPublicRepository, parseGitHubRepo } from '../../services/githubClone.js';

export default {
  name: 'gitclone',
  command: ['gitclone'],
  aliases: ['ghclone'],
  menuCommands: ['gitclone'],
  category: 'downloader',
  description: 'Unduh ZIP repository GitHub publik dengan batas ukuran',
  cooldown: 10_000,
  async execute(ctx) {
    const raw = (ctx.args || []).join(' ').trim();
    if (!raw) return ctx.reply(`📦 *GitHub Clone*\nFormat: ${ctx.prefix}gitclone owner/repo\nAtau: ${ctx.prefix}gitclone https://github.com/owner/repo\nBranch opsional: ${ctx.prefix}gitclone owner/repo#branch\n\nHanya repository publik, maksimum 24 MB.`);
    try {
      const parsed = parseGitHubRepo(raw);
      await ctx.reply(`⏳ Mengambil arsip publik ${parsed.fullName}${parsed.branch ? ` (branch ${parsed.branch})` : ''}...`);
      const result = await downloadPublicRepository(parsed);
      const sock = ctx.sock || ctx.client;
      if (!sock?.sendMessage) throw new Error('Koneksi WhatsApp tidak tersedia.');
      return await sock.sendMessage(ctx.chat || ctx.sender, {
        document: result.buffer,
        mimetype: 'application/zip',
        fileName: result.fileName,
        caption: `📦 *GitHub Repository ZIP*\nRepository: ${result.fullName}\nBranch: ${result.branch}\nUkuran: ${(result.size / 1024 / 1024).toFixed(2)} MB\n${result.url}\n\nHanya arsip source publik; tidak menjalankan kode dari repository.`
      }, ctx.raw ? { quoted: ctx.raw } : {});
    } catch (error) {
      return ctx.reply(`❌ GitHub Clone gagal: ${String(error?.message || error).slice(0, 350)}`);
    }
  }
};

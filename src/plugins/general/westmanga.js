import {
  westmangaHome,
  westmangaSearch,
  westmangaDetail,
  westmangaRead,
  westmangaDownload,
  formatWestmangaResult,
  getWestmangaControllerStatus,
} from '../../services/WestmangaLibraryController.js';

const usage = [
  '.wm — menu Westmanga',
  '.wmhome — update dan manga populer',
  '.wmsearch <kata kunci> — cari manga',
  '.wmdetail <slug/URL> — detail dan daftar chapter',
  '.wmread <slug/URL chapter> — daftar URL halaman chapter',
  '.wmdownload <slug/URL chapter> — unduh chapter ke penyimpanan server yang dibatasi',
].join('\n');

export default {
  name: 'westmanga',
  command: ['wm', 'wmhome', 'wmsearch', 'wmdetail', 'wmread', 'wmdownload'],
  menuCommands: ['wm', 'wmhome', 'wmsearch', 'wmdetail', 'wmread', 'wmdownload'],
  category: 'tools',
  workload: 'network',
  cooldown: 1800,
  description: 'Cari, lihat detail, baca halaman, dan unduh chapter Westmanga',
  async execute(ctx) {
    const args = ctx.args || [];
    const target = args.join(' ').trim();
    const command = String(ctx.command || 'wm').toLowerCase();
    if (command === 'wm' && !target) {
      const status = getWestmangaControllerStatus();
      return ctx.sendInteractive({
        title: 'Westmanga · Manga Library',
        body: `${usage}\n\nProvider: ${status.providers.map(item => `${item.id} [${item.capabilities.join(', ')}]`).join('\n')}\nSource CommonJS dilindungi; controller dan command berada di luar source asli.`,
        buttons: [
          { name: 'quick_reply', title: 'Update Manga', id: `${ctx.prefix}wmhome` },
          { name: 'quick_reply', title: 'Cari Manga', id: `${ctx.prefix}wmsearch ` },
          { name: 'quick_reply', title: 'Status Provider', id: `${ctx.prefix}wm status` },
        ],
      });
    }
    if (command === 'wm' && args[0]?.toLowerCase() === 'status') {
      const status = getWestmangaControllerStatus();
      return ctx.reply(`WESTMANGA PROVIDER\n${status.providers.map(item => `• ${item.id}: ${item.capabilities.join(', ')}\n  failures=${item.failures} cooldown=${item.cooldownUntil > Date.now() ? 'ON' : 'OFF'}`).join('\n')}\nSource protected: ${status.sourceProtected ? 'yes' : 'no'}`);
    }
    if (command === 'wmhome') {
      const result = await westmangaHome();
      return ctx.reply(formatWestmangaResult('home', result));
    }
    if (command === 'wmsearch') {
      if (!target) return ctx.reply(`Masukkan kata kunci.\nContoh: ${ctx.prefix}wmsearch one piece`);
      const result = await westmangaSearch(target, { page: Number(args.at(-1)) || 1 });
      return ctx.reply(formatWestmangaResult('search', result));
    }
    if (command === 'wmdetail') {
      if (!target) return ctx.reply(`Masukkan slug atau URL manga.\n${ctx.prefix}wmdetail <slug/URL>`);
      const result = await westmangaDetail(target);
      return ctx.reply(formatWestmangaResult('detail', result));
    }
    if (command === 'wmread') {
      if (!target) return ctx.reply(`Masukkan slug atau URL chapter.\n${ctx.prefix}wmread <slug/URL chapter>`);
      const result = await westmangaRead(target);
      return ctx.reply(formatWestmangaResult('read', result));
    }
    if (command === 'wmdownload') {
      if (!target) return ctx.reply(`Masukkan slug atau URL chapter.\n${ctx.prefix}wmdownload <slug/URL chapter>`);
      const result = await westmangaDownload(target);
      return ctx.sendInteractive({
        title: 'Unduhan Westmanga Selesai',
        subtitle: `${result.count} halaman · ${(result.totalBytes / 1048576).toFixed(2)} MiB`,
        body: `Judul: ${result.comicTitle || '-'}\nChapter: ${result.chapterNumber || result.chapterSlug}\nLokasi: ${result.folder}\n\nSource scraper asli tetap tidak diubah. Hasil disimpan di direktori data yang diizinkan.`,
        buttons: [
          { name: 'quick_reply', title: 'Baca daftar halaman', id: `${ctx.prefix}wmread ${result.chapterSlug}` },
          { name: 'quick_reply', title: 'Menu Westmanga', id: `${ctx.prefix}wm` },
        ],
      });
    }
    return ctx.reply(usage);
  },
};

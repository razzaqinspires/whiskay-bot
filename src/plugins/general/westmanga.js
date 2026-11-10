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

function toCards(items, { action = 'detail', prefix = '.', section = '' } = {}) {
  return (Array.isArray(items) ? items : []).slice(0, 10).map((item, index) => ({
    title: String(item.title || item.comicTitle || `Manga ${index + 1}`).slice(0, 80),
    image: item.cover || item.url || '',
    body: [
      section,
      item.status ? `Status: ${item.status}` : '',
      item.rating != null ? `Rating: ${item.rating}` : '',
      item.views ? `Views: ${item.views}` : '',
      item.number ? `Chapter: ${item.number}` : '',
      item.updatedAt ? `Update: ${item.updatedAt}` : '',
      item.slug ? `Slug: ${item.slug}` : ''
    ].filter(Boolean).join('\n').slice(0, 1000),
    footer: 'Westmanga · Source',
    buttonTitle: action === 'read' ? 'Baca Chapter' : 'Lihat Detail',
    id: item.slug ? `${prefix}${action === 'read' ? 'wmread' : 'wmdetail'} ${item.slug}` : ''
  }));
}

async function sendCards(ctx, title, body, items, options = {}) {
  const cards = toCards(items, { ...options, prefix: ctx.prefix || '.' });
  if (cards.length && cards.every(card => card.image) && typeof ctx.sendCarousel === 'function') {
    try {
      return await ctx.sendCarousel({ body: `${title}\n${body}`, footer: 'Westmanga · Pilih kartu untuk melanjutkan', cards });
    } catch (error) {
      console.warn('[WESTMANGA] carousel fallback:', error?.message || error);
    }
  }
  const rows = (Array.isArray(items) ? items : []).slice(0, 10).map((item, index) => ({
    title: String(item.title || `Item ${index + 1}`).slice(0, 24),
    description: [item.status, item.rating != null ? `Rating ${item.rating}` : ''].filter(Boolean).join(' · ').slice(0, 72),
    id: item.slug ? `${ctx.prefix}${options.action === 'read' ? 'wmread' : 'wmdetail'} ${item.slug}` : `${ctx.prefix}wm`
  }));
  return ctx.sendInteractive({
    title,
    body: `${body}\n\n${items?.length || 0} item tersedia.`,
    buttons: rows.length ? [{ name: 'single_select', title: 'Pilih Manga', sections: [{ title: 'Hasil', rows }] }] : [{ name: 'quick_reply', title: 'Menu Westmanga', id: `${ctx.prefix}wm` }]
  });
}

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
      const data = result?.result || result || {};
      const sections = [
        ['Pembaruan mirror', Array.isArray(data.mirrorUpdates) ? data.mirrorUpdates : []],
        ['Populer', Array.isArray(data.popular) ? data.popular : []],
        ['Proyek baru', Array.isArray(data.newProjects) ? data.newProjects : []],
        ['Pembaruan proyek', Array.isArray(data.projectUpdates) ? data.projectUpdates : []],
      ];
      const merged = sections.flatMap(([name, items]) => items.map(item => ({ ...item, section: name }))).slice(0, 10);
      if (!merged.length) return ctx.sendInteractive({ title: 'Westmanga · Belum Ada Update', body: 'Provider merespons normal, tetapi belum ada manga yang dapat ditampilkan.', buttons: [{ name: 'quick_reply', title: 'Coba Lagi', id: `${ctx.prefix}wmhome` }, { name: 'quick_reply', title: 'Cari Manga', id: `${ctx.prefix}wmsearch ` }] });
      return sendCards(ctx, 'Westmanga · Update Manga', 'Pembaruan, populer, dan proyek baru.', merged, { action: 'detail' });
    }
    if (command === 'wmsearch') {
      if (!target) return ctx.reply(`Masukkan kata kunci.\nContoh: ${ctx.prefix}wmsearch one piece`);
      const result = await westmangaSearch(target, { page: Number(args.at(-1)) || 1 });
      const data = result?.result || result || {};
      const items = Array.isArray(data.results) ? data.results : [];
      if (!items.length) return ctx.sendInteractive({ title: 'Westmanga · Tidak Ada Hasil', body: `Pencarian untuk “${target}” tidak menemukan judul.`, buttons: [{ name: 'quick_reply', title: 'Cari Lagi', id: `${ctx.prefix}wmsearch ` }, { name: 'quick_reply', title: 'Menu', id: `${ctx.prefix}wm` }] });
      return sendCards(ctx, `Hasil Westmanga · ${items.length}`, `Kata kunci: ${target}`, items, { action: 'detail' });
    }
    if (command === 'wmdetail') {
      if (!target) return ctx.reply(`Masukkan slug atau URL manga.\n${ctx.prefix}wmdetail <slug/URL>`);
      const result = await westmangaDetail(target);
      const data = result?.result || result || {};
      const chapters = Array.isArray(data.chapters) ? data.chapters : [];
      const rows = chapters.slice(0, 10).map((chapter, index) => ({
        title: `Chapter ${String(chapter.number || index + 1)}`.slice(0, 24),
        description: String(chapter.title || chapter.slug || '').slice(0, 72),
        id: `${ctx.prefix}wmread ${chapter.slug || ''}`
      }));
      return ctx.sendInteractive({
        title: `Westmanga · ${String(data.title || 'Detail Manga').slice(0, 70)}`,
        subtitle: `${data.status || 'Status tidak diketahui'} · ${chapters.length} chapter`,
        body: `${String(data.synopsis || 'Sinopsis tidak tersedia.').slice(0, 850)}

Pilih chapter untuk membaca.`,
        buttons: [
          ...(rows.length ? [{ name: 'single_select', title: 'Daftar Chapter', sections: [{ title: 'Chapter terbaru', rows }] }] : []),
          { name: 'quick_reply', title: 'Kembali ke Update', id: `${ctx.prefix}wmhome` }
        ]
      });
    }
    if (command === 'wmread') {
      if (!target) return ctx.reply(`Masukkan slug atau URL chapter.\n${ctx.prefix}wmread <slug/URL chapter>`);
      const result = await westmangaRead(target);
      const data = result?.result || result || {};
      const images = Array.isArray(data.images) ? data.images : [];
      const cards = images.slice(0, 10).map((image, index) => ({
        title: `Halaman ${image.page || index + 1}`,
        image: image.url,
        body: `${data.comicTitle || 'Westmanga'} · ${data.chapterNumber || data.chapterSlug || ''}`,
        footer: `Halaman ${index + 1} dari ${images.length}`
      }));
      if (cards.length && cards.every(card => card.image)) return ctx.sendCarousel({ body: `Westmanga Reader · ${data.comicTitle || ''}
Chapter ${data.chapterNumber || data.chapterSlug || '-'}`, cards, footer: 'Westmanga Reader · Geser untuk halaman berikutnya' });
      return ctx.sendInteractive({ title: 'Westmanga Reader', body: `Daftar halaman tidak memiliki gambar yang dapat ditampilkan. Total: ${images.length}.`, buttons: [{ name: 'quick_reply', title: 'Detail Manga', id: `${ctx.prefix}wmdetail ${data.comicSlug || ''}` }, { name: 'quick_reply', title: 'Menu', id: `${ctx.prefix}wm` }] });
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

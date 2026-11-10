const clean = (value, max = 100) => String(value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/[*_~`]/g, '').trim().slice(0, max);
async function jikan(endpoint) {
  const response = await fetch(`https://api.jikan.moe/v4/${endpoint}`, { headers: { accept: 'application/json', 'user-agent': 'WHISKAYBot/Stage33' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Jikan HTTP ${response.status}`);
  return response.json();
}
export default {
  name: 'anime-search', command: ['anime','manga','animeinfo','mangainfo'], category: 'tools', cooldown: 6500,
  description: 'Cari informasi anime atau manga dari katalog publik Jikan/MyAnimeList',
  async execute(ctx) {
    const command = String(ctx.command || 'anime').toLowerCase();
    const query = clean(ctx.args?.join(' '), 100);
    if (['animeinfo', 'mangainfo'].includes(command)) {
      const id = Number(ctx.args?.[0]);
      if (!Number.isSafeInteger(id) || id <= 0) return ctx.sendInteractive({ title: 'Detail Anime/Manga', body: `Gunakan ${ctx.prefix}${command} <mal_id>.`, buttons: [{ name: 'quick_reply', title: 'Menu Anime', id: `${ctx.prefix}anime` }, { name: 'quick_reply', title: 'Menu Manga', id: `${ctx.prefix}manga` }] });
      const kind = command === 'mangainfo' ? 'manga' : 'anime';
      const detail = await jikan(`${kind}/${id}/full`);
      const item = detail.data || {};
      const image = item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '';
      const body = [
        clean(item.title_english || item.title || 'Tanpa judul', 120),
        `Jenis: ${clean(item.type || '-', 35)} · Status: ${clean(item.status || '-', 35)}`,
        `Skor: ${Number.isFinite(Number(item.score)) ? Number(item.score).toFixed(1) : '-'}`,
        clean(item.synopsis || 'Sinopsis belum tersedia.', 900),
        item.url || ''
      ].join('\\n');
      return ctx.sendInteractive({ title: `WHISKAY · ${kind.toUpperCase()} DETAIL`, body, image, buttons: [{ name: 'cta_url', title: 'Buka MyAnimeList', url: item.url || 'https://myanimelist.net' }, { name: 'quick_reply', title: 'Cari Lagi', id: `${ctx.prefix}${kind} ` }] });
    }
    if (!query) return ctx.sendInteractive({ title: '🎌 WHISKAY ANIME FINDER', body: 'Gunakan .anime <judul> atau .manga <judul>. Hasil berasal dari katalog publik, bukan rekomendasi resmi.', buttons: [{ name: 'quick_reply', title: 'Cari Naruto', id: `${ctx.prefix}anime Naruto` }, { name: 'quick_reply', title: 'Cari manga', id: `${ctx.prefix}manga One Piece` }, { name: 'quick_reply', title: 'Menu', id: `${ctx.prefix}menu` }] });
    const type = command === 'manga' ? 'manga' : 'anime';
    try {
      const data = await jikan(`${type}?q=${encodeURIComponent(query)}&limit=5&sfw=true`);
      const entries = (data.data || []).slice(0, 5);
      if (!entries.length) return ctx.reply(`Tidak ada hasil ${type} untuk “${query}”. Coba kata kunci lain.`);
      const cards = entries.map((item, i) => {
        const title = clean(item.title_english || item.title || 'Tanpa judul', 80);
        const synopsis = clean(item.synopsis || 'Sinopsis belum tersedia.', 500);
        const typeLabel = clean(item.type || item.status || '-', 35);
        const score = Number.isFinite(Number(item.score)) ? Number(item.score).toFixed(1) : 'belum ada skor';
        return {
          title,
          image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
          body: `#${i + 1} · ${typeLabel}\nSkor: ${score}\n${synopsis}`.slice(0, 1000),
          footer: 'MyAnimeList · Jikan API',
          buttonTitle: 'Detail',
          id: `${ctx.prefix}${type}info ${item.mal_id}`
        };
      });
      if (cards.every(card => card.image) && typeof ctx.sendCarousel === 'function') {
        try {
          return await ctx.sendCarousel({
            body: `${type === 'anime' ? 'WHISKAY · ANIME SEARCH' : 'WHISKAY · MANGA SEARCH'}\nKata kunci: ${query}`,
            footer: 'Geser kartu untuk melihat hasil lainnya · Sumber: Jikan API / MyAnimeList',
            cards
          });
        } catch (carouselError) {
          console.warn('[ANIME SEARCH] carousel fallback:', carouselError?.message || carouselError);
        }
      }
      const rows = entries.map(item => ({
        title: clean(item.title_english || item.title || 'Tanpa judul', 24),
        description: `Skor ${Number.isFinite(Number(item.score)) ? Number(item.score).toFixed(1) : '-'} · ${clean(item.type || '-', 24)}`,
        id: `${ctx.prefix}${type}info ${item.mal_id}`
      }));
      return ctx.sendInteractive({
        title: type === 'anime' ? '🎌 WHISKAY · ANIME SEARCH' : '📚 WHISKAY · MANGA SEARCH',
        subtitle: `Kata kunci: ${query}`,
        body: `${entries.length} hasil ditemukan. Pilih judul untuk detail.`,
        buttons: [{ name: 'single_select', title: 'Pilih Judul', sections: [{ title: 'Hasil Pencarian', rows }] }, { name: 'quick_reply', title: 'Cari Lagi', id: `${ctx.prefix}${type} ${query}` }]
      });
    } catch (error) {
      console.error('[ANIME SEARCH] failed:', error?.message || error);
      return ctx.reply('⚠️ Katalog anime/manga belum dapat diakses. Coba lagi nanti; layanan publik dapat menerapkan rate limit.');
    }
  }
};

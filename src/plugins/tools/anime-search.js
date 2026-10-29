const clean = (value, max = 100) => String(value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/[*_~`]/g, '').trim().slice(0, max);
async function jikan(endpoint) {
  const response = await fetch(`https://api.jikan.moe/v4/${endpoint}`, { headers: { accept: 'application/json', 'user-agent': 'WHISKAYBot/Stage33' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Jikan HTTP ${response.status}`);
  return response.json();
}
export default {
  name: 'anime-search', command: ['anime','manga'], category: 'tools', cooldown: 6500,
  description: 'Cari informasi anime atau manga dari katalog publik Jikan/MyAnimeList',
  async execute(ctx) {
    const query = clean(ctx.args?.join(' '), 100);
    if (!query) return ctx.sendInteractive({ title: '🎌 WHISKAY ANIME FINDER', body: 'Gunakan .anime <judul> atau .manga <judul>. Hasil berasal dari katalog publik, bukan rekomendasi resmi.', buttons: [{ name: 'quick_reply', title: 'Cari Naruto', id: `${ctx.prefix}anime Naruto` }, { name: 'quick_reply', title: 'Cari manga', id: `${ctx.prefix}manga One Piece` }, { name: 'quick_reply', title: 'Menu', id: `${ctx.prefix}menu` }] });
    const type = String(ctx.command).toLowerCase() === 'manga' ? 'manga' : 'anime';
    try {
      const data = await jikan(`${type}?q=${encodeURIComponent(query)}&limit=5&sfw=true`);
      const entries = (data.data || []).slice(0, 5);
      if (!entries.length) return ctx.reply(`Tidak ada hasil ${type} untuk “${query}”. Coba kata kunci lain.`);
      const body = entries.map((item, i) => {
        const title = clean(item.title_english || item.title || 'Tanpa judul', 120);
        const synopsis = clean(item.synopsis || 'Sinopsis belum tersedia.', 220);
        const typeLabel = clean(item.type || item.status || '-', 35);
        const score = Number.isFinite(Number(item.score)) ? Number(item.score).toFixed(1) : 'belum ada skor';
        return `${i + 1}. *${title}*\nJenis/status: ${typeLabel} · Skor: ${score}\n${synopsis}\n${item.url || ''}`;
      }).join('\n\n');
      return ctx.sendInteractive({ title: type === 'anime' ? '🎌 WHISKAY · ANIME SEARCH' : '📚 WHISKAY · MANGA SEARCH', subtitle: `Kata kunci: ${query}`, body: `${body}\n\nSumber: Jikan API, katalog publik MyAnimeList.`, buttons: [{ name: 'quick_reply', title: 'Cari lagi', id: `${ctx.prefix}${type} ${query}` }, { name: 'quick_reply', title: 'Menu', id: `${ctx.prefix}menu` }] });
    } catch (error) {
      console.error('[ANIME SEARCH] failed:', error?.message || error);
      return ctx.reply('⚠️ Katalog anime/manga belum dapat diakses. Coba lagi nanti; layanan publik dapat menerapkan rate limit.');
    }
  }
};

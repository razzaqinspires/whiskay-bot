const FEEDS = [
  'https://news.google.com/rss/search?q={query}&hl=id&gl=ID&ceid=ID:id',
];
const decode = (s = '') => String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();
function parseItems(xml) {
  return [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].slice(0, 8).map((m) => {
    const field = (name) => decode(m[1].match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '');
    const title = field('title'), link = field('link'), date = field('pubDate');
    if (!title || !/^https:\/\//i.test(link)) return null;
    return { title: title.slice(0, 240), link, date };
  }).filter(Boolean);
}
export default {
  name: 'news-fetcher', command: ['berita', 'news'], category: 'tools', cooldown: 8000,
  description: 'Berita terbaru dari RSS publik',
  async execute(ctx) {
    const query = String(ctx.args?.join(' ') || 'Indonesia').trim().slice(0, 80) || 'Indonesia';
    const url = FEEDS[0].replace('{query}', encodeURIComponent(query));
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'WHISKAYBot/1.0 (news RSS reader)', accept: 'application/rss+xml, application/xml, text/xml' } });
      if (!response.ok) throw new Error(`RSS HTTP ${response.status}`);
      const xml = await response.text();
      const items = parseItems(xml);
      if (!items.length) return ctx.reply('📰 Berita belum tersedia untuk kata kunci itu. Coba `.berita Indonesia`.');
      const body = items.slice(0, 5).map((item, i) => `${i + 1}. *${item.title}*${item.date ? `\n   🕒 ${item.date}` : ''}\n   🔗 ${item.link}`).join('\n\n');
      return ctx.reply(`📰 *WHISKAY NEWS — ${query.toUpperCase()}*\n_Sumber: Google News RSS · hasil terbaru yang tersedia_\n\n${body}\n\n_Ketik .berita <topik> untuk mencari topik lain._`);
    } catch (error) {
      console.error('[NEWS] fetch failed:', error?.message || error);
      return ctx.reply('⚠️ Layanan berita sedang tidak dapat diakses. Coba lagi beberapa saat.');
    } finally { clearTimeout(timer); }
  }
};

const safe = (value, max = 120) => String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const LANGS = new Set(['id','en','ms','ar','de','es','fr','it','ja','ko','pt','ru','th','tr','vi','zh-CN']);
export function weatherLabel(code) {
  const labels = {0:'Cerah',1:'Cerah berawan',2:'Cerah berawan',3:'Berawan',45:'Berkabut',48:'Kabut beku',51:'Gerimis ringan',53:'Gerimis',55:'Gerimis lebat',61:'Hujan ringan',63:'Hujan',65:'Hujan lebat',71:'Salju ringan',73:'Salju',75:'Salju lebat',80:'Hujan lokal',81:'Hujan lokal',82:'Hujan lokal lebat',95:'Badai petir',96:'Badai petir dan hujan es',99:'Badai petir dan hujan es'};
  return labels[Number(code)] || 'Kondisi tidak diketahui';
}
export function parseTranslateArgs(args = []) {
  const [from, to, ...rest] = args;
  const source = String(from || '').trim(); const target = String(to || '').trim();
  const text = safe(rest.join(' '), 1200);
  if (!LANGS.has(source) || !LANGS.has(target) || !text) return null;
  return { source, target, text };
}
async function getJson(url, timeout = 9000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'WHISKAYBot/Stage33' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
async function weather(ctx) {
  const city = safe(ctx.args?.join(' '), 80);
  if (!city) return ctx.sendInteractive({ title: '🌦️ WHISKAY WEATHER', body: 'Format: .cuaca nama kota\nContoh: .cuaca Medan\nData menggunakan Open-Meteo tanpa API key.', buttons: [{ name: 'quick_reply', title: 'Cuaca Medan', id: `${ctx.prefix}cuaca Medan` }, { name: 'quick_reply', title: 'Menu', id: `${ctx.prefix}menu` }] });
  try {
    const query = new URLSearchParams({ name: city, count: '1', language: 'id', format: 'json' });
    const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?${query}`);
    const place = geo.results?.[0];
    if (!place) return ctx.reply(`Lokasi “${city}” tidak ditemukan. Periksa ejaan atau masukkan nama kota yang lebih spesifik.`);
    const qs = new URLSearchParams({ latitude: String(place.latitude), longitude: String(place.longitude), current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m', timezone: 'auto' });
    const data = await getJson(`https://api.open-meteo.com/v1/forecast?${qs}`);
    const c = data.current || {};
    const placeName = [place.name, place.admin1, place.country].filter(Boolean).join(', ');
    return ctx.sendInteractive({ title: '🌦️ WHISKAY WEATHER', subtitle: placeName, body: `Kondisi saat ini\n${weatherLabel(c.weather_code)}\n\nSuhu: ${Number(c.temperature_2m).toFixed(1)} °C\nTerasa: ${Number(c.apparent_temperature).toFixed(1)} °C\nKelembapan: ${Number(c.relative_humidity_2m)}%\nAngin: ${Number(c.wind_speed_10m).toFixed(1)} km/jam\nCurah hujan saat ini: ${Number(c.precipitation || 0).toFixed(1)} mm\nWaktu data: ${c.time || '-'} (${data.timezone || 'waktu lokal'})\n\nSumber: Open-Meteo. Ini kondisi saat ini, bukan jaminan cuaca jangka panjang.`, buttons: [{ name: 'quick_reply', title: 'Refresh', id: `${ctx.prefix}cuaca ${city}` }, { name: 'quick_reply', title: 'Menu', id: `${ctx.prefix}menu` }] });
  } catch (error) {
    console.error('[WEATHER] request failed:', error?.message || error);
    return ctx.reply('⚠️ Data cuaca sementara tidak tersedia. Coba lagi nanti atau periksa koneksi server.');
  }
}
async function translate(ctx) {
  const parsed = parseTranslateArgs(ctx.args || []);
  if (!parsed) return ctx.sendInteractive({ title: '🌐 WHISKAY TRANSLATE', body: 'Format: .translate <bahasa-asal> <bahasa-tujuan> <teks>\nContoh: .translate id en Selamat pagi\nKode bahasa yang didukung antara lain id, en, ms, ja, ko, zh-CN, ar, es, fr, dan de. Teks dikirim ke layanan terjemahan pihak ketiga.', buttons: [{ name: 'quick_reply', title: 'Contoh ID → EN', id: `${ctx.prefix}translate id en Selamat pagi, apa kabar?` }, { name: 'quick_reply', title: 'Menu', id: `${ctx.prefix}menu` }] });
  try {
    const qs = new URLSearchParams({ q: parsed.text, langpair: `${parsed.source}|${parsed.target}` });
    const data = await getJson(`https://api.mymemory.translated.net/get?${qs}`, 12_000);
    const translated = safe(data.responseData?.translatedText, 2600);
    if (!translated || Number(data.responseStatus) >= 400) throw new Error('Terjemahan kosong atau ditolak provider');
    return ctx.sendInteractive({ title: '🌐 WHISKAY TRANSLATE', body: `Asal: ${parsed.source}\nTujuan: ${parsed.target}\n\nTeks asli:\n${parsed.text}\n\nHasil:\n${translated}\n\nTerjemahan otomatis bisa keliru; periksa kembali untuk informasi penting.`, buttons: [{ name: 'quick_reply', title: 'Terjemahkan lagi', id: `${ctx.prefix}translate ${parsed.source} ${parsed.target} ` + parsed.text.slice(0, 80) }, { name: 'quick_reply', title: 'Menu', id: `${ctx.prefix}menu` }] });
  } catch (error) {
    console.error('[TRANSLATE] request failed:', error?.message || error);
    return ctx.reply('⚠️ Terjemahan gagal diambil. Coba teks lebih pendek atau ulangi beberapa saat lagi.');
  }
}
export default {
  name: 'weather-translate', command: ['cuaca','translate','terjemah'], aliases: ['translation'],
  menuCommands: ['cuaca','translate'], category: 'tools', cooldown: 6000,
  description: 'Cuaca Open-Meteo dan terjemahan melalui layanan publik',
  async execute(ctx) {
    const cmd = String(ctx.command || '').toLowerCase();
    if (cmd === 'cuaca') return weather(ctx);
    return translate(ctx);
  }
};

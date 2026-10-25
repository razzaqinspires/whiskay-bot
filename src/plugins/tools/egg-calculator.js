const getCalculatorUrl = () => String(process.env.EGG_CALCULATOR_URL || '').trim();

function validateCalculatorUrl(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch { return null; }
  if (parsed.username || parsed.password) return null;
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) return null;
  return parsed;
}

export default {
  name: 'egg-calculator',
  command: ['telur', 'kalkulatortelur', 'hitungtelur'],
  aliases: ['eggcalc', 'hitungtelur'],
  menuCommands: ['telur'],
  description: 'Kalkulator jumlah telur, total belanja, dan uang kembalian',
  menuDescriptions: { telur: 'Hitung jumlah telur dan uang kembalian' },
  category: 'tools',
  cooldown: 2000,
  async execute(ctx) {
    const rawUrl = getCalculatorUrl();
    if (!rawUrl) {
      return ctx.sendInteractive({
        title: 'Kalkulator Telur',
        subtitle: 'Konfigurasi belum selesai',
        body: 'Website kalkulator dijalankan sebagai layanan terpisah. Deploy folder `egg-calculator-server` ke server dengan HTTPS, lalu isi EGG_CALCULATOR_URL di .env dengan URL publiknya dan restart bot.\n\nContoh: uang Rp10.000, harga Rp1.700 → 5 butir, total Rp8.500, kembalian Rp1.500.',
        footer: 'Periksa docs/EGG-CALCULATOR.md untuk petunjuk deploy dan troubleshooting.',
        buttons: [{ name: 'quick_reply', title: 'Panduan Kalkulator', id: `${ctx.prefix}egghelp` }]
      });
    }

    const url = validateCalculatorUrl(rawUrl);
    if (!url) {
      return ctx.reply('URL kalkulator telur tidak valid. Gunakan URL HTTPS publik tanpa username/password, lalu periksa EGG_CALCULATOR_URL di .env. localhost hanya diizinkan untuk pengujian lokal.');
    }

    // Serializer compatibility contract: open_webview is normalized to native-flow cta_url.
    // Keep the concise button shape; src/lib/interactive.js adds merchant_url and webview_interaction.
    return ctx.sendInteractive({
      title: 'Kalkulator Telur',
      subtitle: 'Hitung jumlah telur dan kembalian',
      body: 'Masukkan uang pembeli dan harga satu butir telur. Website akan menghitung jumlah telur utuh, total belanja, kembalian, serta kekurangan untuk membeli satu butir lagi.\n\nContoh: Rp10.000 ÷ Rp1.700 = 5 butir. Total Rp8.500, kembalian Rp1.500.',
      footer: 'Kalkulator berjalan di server terpisah; riwayat disimpan lokal di browser pengguna.',
      buttons: [
        { name: 'open_webview', title: 'Buka Kalkulator', url: url.toString() },
        { name: 'quick_reply', title: 'Cara Menghitung', id: `${ctx.prefix}egghelp` }
      ]
    });
  }
};

import { calculateEggTransaction } from '../../lib/egg-calculator.js';
import { renderEggResultCardV2 } from '../../services/canvas-v2.js';

const getCalculatorUrl = () => String(process.env.EGG_CALCULATOR_URL || '').trim();
function validateCalculatorUrl(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch { return null; }
  if (parsed.username || parsed.password) return null;
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) return null;
  return parsed;
}
const rupiah = n => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const presets = [
  [10000, 1700], [20000, 1700], [50000, 1700],
  [10000, 2000], [20000, 2000], [50000, 2000],
  [100000, 2500], [50000, 2500]
];
async function showResult(ctx, uang, harga) {
  const result = calculateEggTransaction(uang, harga);
  let card = null;
  try { card = await renderEggResultCardV2({ uang: result.uang, harga: result.harga, jumlah: result.jumlah, total: result.total, kembalian: result.kembalian, kurang: result.kurang }); } catch { /* Keep calculator usable if canvas/FFmpeg is unavailable. */ }
  return ctx.sendInteractive({
    title: 'Hasil Kalkulator Telur',
    subtitle: `${result.jumlah} butir · ${rupiah(result.total)}`,
    body: `Uang pembeli: ${rupiah(result.uang)}\nHarga per butir: ${rupiah(result.harga)}\nJumlah telur utuh: ${result.jumlah} butir\nTotal belanja: ${rupiah(result.total)}\n${result.jumlah === 0 && result.kurang > 0 ? `Uang belum cukup; kurang ${rupiah(result.kurang)} (uang tersedia ${rupiah(result.uang)})` : `Kembalian: ${rupiah(result.kembalian)}`}`,
    footer: 'Kartu hasil dibuat lokal oleh WHISKAY Bot. Pastikan harga sesuai transaksi.',
    image: card || undefined,
    buttons: [
      { name: 'quick_reply', title: 'Hitung Lagi', id: `${ctx.prefix}telur` },
      { name: 'quick_reply', title: 'Input Manual', id: `${ctx.prefix}telur manual` },
      ...(validateCalculatorUrl(getCalculatorUrl()) ? [{ name: 'open_webview', title: 'Buka Website Kalkulator', url: validateCalculatorUrl(getCalculatorUrl()).toString() }] : [])
    ]
  });
}
export default {
  name: 'egg-calculator',
  command: ['telur', 'kalkulatortelur', 'hitungtelur'],
  aliases: ['eggcalc', 'hitungtelur'],
  menuCommands: ['telur'],
  description: 'Kalkulator penjualan telur dengan pilihan cepat, input manual dan kartu hasil',
  menuDescriptions: { telur: 'Hitung jumlah telur, total belanja dan kembalian' },
  category: 'tools',
  cooldown: 1500,
  async execute(ctx) {
    const [actionRaw, uangRaw, hargaRaw] = ctx.args || [];
    const action = String(actionRaw || '').toLowerCase();
    if (action === 'hitung' || action === 'calc') {
      const uang = Number(String(uangRaw || '').replace(/[.,\sRp]/gi, ''));
      const harga = Number(String(hargaRaw || '').replace(/[.,\sRp]/gi, ''));
      try { return await showResult(ctx, uang, harga); }
      catch (err) { return ctx.reply(`Input belum valid: ${err.message}\nFormat: ${ctx.prefix}telur hitung 10000 1700`); }
    }
    if (action === 'preset') {
      const [amount, price] = [Number(uangRaw), Number(hargaRaw)];
      try { return await showResult(ctx, amount, price); }
      catch (err) { return ctx.reply(`Preset tidak valid: ${err.message}`); }
    }
    if (action === 'manual') {
      return ctx.sendInteractive({
        title: 'Input Manual Kalkulator Telur',
        body: `Kirim command dengan nominal uang dan harga per butir.\n\nFormat: ${ctx.prefix}telur hitung UANG HARGA\nContoh: ${ctx.prefix}telur hitung 10000 1700\n\nGunakan angka saja tanpa titik pemisah ribuan.`,
        buttons: [{ name: 'quick_reply', title: 'Kembali ke Pilihan', id: `${ctx.prefix}telur` }]
      });
    }
    const rawUrl = getCalculatorUrl();
    const url = rawUrl ? validateCalculatorUrl(rawUrl) : null;
    if (rawUrl && !url) return ctx.reply('URL kalkulator telur tidak valid. Gunakan HTTPS publik tanpa username/password; localhost hanya untuk pengujian lokal.');
    const sections = [{ title: 'Pilihan transaksi cepat', rows: presets.map(([amount, price], i) => ({
      title: `${i + 1}. ${rupiah(amount)} · ${rupiah(price)}/butir`,
      description: `Hitung otomatis ${Math.floor(amount / price)} butir`,
      id: `${ctx.prefix}telur preset ${amount} ${price}`
    })) }];
    return ctx.sendInteractive({
      title: '🥚 Kalkulator Penjualan Telur',
      subtitle: 'Pilih transaksi atau masukkan nominal sendiri',
      body: 'Pilih salah satu preset dari daftar. Untuk nominal sendiri, pilih Input Manual lalu kirim command dengan jumlah uang dan harga per butir. Hasil akan ditampilkan sebagai kartu Canvas beserta total dan kembalian.',
      footer: 'Semua hitungan membulatkan jumlah telur ke bawah ke butir utuh.',
      buttons: [
        { name: 'single_select', title: 'Pilih Transaksi', sections },
        { name: 'quick_reply', title: 'Input Manual', id: `${ctx.prefix}telur manual` },
        ...(url ? [{ name: 'open_webview', title: 'Buka Website Kalkulator', url: url.toString() }] : [])
      ]
    });
  }
};

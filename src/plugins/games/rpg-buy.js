import { dashboardPlayerId, dashboardUrl } from '../../services/dungeonWebsiteSync.js';

const API_TIMEOUT_MS = 8000;
const baseUrl = () => String(process.env.DUNGEON_WEBSITE_URL || 'https://whiskay-rpg-companion.vercel.app').replace(/\/+$/, '');

export default {
  name: 'rpg-buy',
  command: ['buy'],
  aliases: ['shopbuy'],
  category: 'games',
  description: 'Beli item RPG dari toko dashboard',
  cooldown: 1500,

  async execute(ctx) {
    const item = String(ctx.args?.[0] || '').trim().toLowerCase();
    if (!item) return ctx.reply('🛒 *TOKO WHISKAY RPG*\nGunakan: `!buy potion`\n🧪 Small Potion — 25 Gold, memulihkan HP.');
    if (!['potion', 'small-potion', 'potion-small'].includes(item)) {
      return ctx.reply('❔ Item belum tersedia. Saat ini kamu bisa membeli: `!buy potion` (25 Gold).');
    }

    const token = String(process.env.DUNGEON_SYNC_TOKEN || process.env.BOT_SYNC_TOKEN || '').trim();
    if (!token) return ctx.reply('⚠️ Shop belum dikonfigurasi. Admin perlu mengatur DUNGEON_SYNC_TOKEN di bot.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const response = await fetch(`${baseUrl()}/api/player/shop`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, accept: 'application/json' },
        body: JSON.stringify({ userId: dashboardPlayerId(ctx.chat, ctx.sender), item: 'potion' }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.ok) {
        return ctx.reply([
          '🛍️ *PEMBELIAN BERHASIL!*',
          '',
          '🧪 Item: *Small Potion ×1*',
          `💸 Harga: *${Number(result.price || 25).toLocaleString('id-ID')} Gold*`,
          `💰 Sisa Gold: *${Number(result.gold || 0).toLocaleString('id-ID')}*`,
          '',
          'Potion telah ditambahkan ke inventory dashboard kamu.',
          `🎒 ${dashboardUrl(ctx.chat, ctx.sender, '/inventory')}`,
        ].join('\n'));
      }
      if (response.status === 409 || result.error === 'insufficient_gold') {
        return ctx.reply(`💰 *Gold belum cukup!*\nHarga Small Potion: *${Number(result.price || 25).toLocaleString('id-ID')} Gold*\nGold kamu: *${Number(result.gold || 0).toLocaleString('id-ID')}*\nJelajahi dungeon atau klaim Daily Reward untuk mengumpulkan Gold.`);
      }
      if (response.status === 401) return ctx.reply('🔒 Autentikasi bot ditolak server. Admin perlu menyamakan token website dan bot.');
      return ctx.reply('⚠️ Pembelian gagal diproses. Gold hanya dipotong jika server mengonfirmasi transaksi berhasil. Coba lagi nanti.');
    } catch (error) {
      return ctx.reply(error?.name === 'AbortError'
        ? '⏱️ Server toko terlalu lama merespons. Status transaksi belum diketahui; cek inventory sebelum mengulang.'
        : '📡 Server WHISKAY RPG sedang tidak dapat dijangkau. Coba lagi nanti.');
    } finally {
      clearTimeout(timer);
    }
  },
};

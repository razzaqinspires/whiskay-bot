import { dashboardPlayerId, dashboardUrl } from '../../services/dungeonWebsiteSync.js';

const API_TIMEOUT_MS = 8000;
const baseUrl = () => String(process.env.DUNGEON_WEBSITE_URL || 'https://whiskay-rpg-companion.vercel.app').replace(/\/+$/, '');

export default {
  name: 'rpg-daily',
  command: ['daily'],
  aliases: ['dailyreward'],
  category: 'games',
  description: 'Klaim hadiah harian WHISKAY RPG (+100 Gold)',
  cooldown: 1500,

  async execute(ctx) {
    const base = baseUrl();
    const token = String(process.env.DUNGEON_SYNC_TOKEN || process.env.BOT_SYNC_TOKEN || '').trim();
    if (!token) return ctx.reply('⚠️ Daily Reward belum dikonfigurasi. Admin perlu mengatur DUNGEON_SYNC_TOKEN di bot.');

    const userId = dashboardPlayerId(ctx.chat, ctx.sender);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const response = await fetch(`${base}/api/player/daily`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, accept: 'application/json' },
        body: JSON.stringify({ userId }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.ok) {
        return ctx.reply([
          '🎁 *DAILY REWARD BERHASIL!*',
          '',
          '⛏️ Kamu menjelajahi tambang kuno dan menemukan *100 Gold*!',
          `💰 Total Gold: *${Number(result.gold || 0).toLocaleString('id-ID')}*`,
          `🕒 Hadiah berikutnya: ${result.nextClaimAt ? new Date(result.nextClaimAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }) : '24 jam lagi'}`,
          '',
          `🌐 ${dashboardUrl(ctx.chat, ctx.sender, '/inventory')}`,
        ].join('\n'));
      }
      if (response.status === 409 || result.error === 'daily_already_claimed') {
        const next = result.nextClaimAt ? new Date(result.nextClaimAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }) : '24 jam setelah klaim terakhir';
        return ctx.reply(`⏳ *Hadiah harian sudah diklaim!*
Kembali lagi: *${next}*.`);
      }
      if (response.status === 401) return ctx.reply('🔒 Autentikasi bot ditolak server. Admin perlu menyamakan token website dan bot.');
      return ctx.reply('⚠️ Hadiah belum dapat diklaim. Server menolak transaksi atau database sedang bermasalah. Coba beberapa saat lagi.');
    } catch (error) {
      const message = error?.name === 'AbortError'
        ? '⏱️ Server terlalu lama merespons. Gold belum dikonfirmasi; periksa status sebelum mencoba lagi.'
        : '📡 Server WHISKAY RPG sedang tidak dapat dijangkau. Coba lagi nanti.';
      return ctx.reply(message);
    } finally {
      clearTimeout(timer);
    }
  },
};

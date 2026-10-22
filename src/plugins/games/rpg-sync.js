import { dashboardPlayerId, dashboardUrl } from '../../services/dungeonWebsiteSync.js';

const number = value => Number.isFinite(Number(value))
  ? Math.max(0, Math.floor(Number(value))).toLocaleString('id-ID')
  : '0';

export default {
  name: 'rpg-sync',
  command: ['rpgsync'],
  aliases: ['rpgsyncstatus'],
  category: 'games',
  description: 'Periksa koneksi dashboard WHISKAY RPG',
  cooldown: 3000,

  async execute(ctx) {
    const base = String(
      process.env.DUNGEON_WEBSITE_URL || ''
    ).replace(/\/+$/, '');

    if (!base) {
      return ctx.reply('⚠️ URL website RPG belum dikonfigurasi. Atur DUNGEON_WEBSITE_URL pada environment bot.');
    }

    const playerId = dashboardPlayerId(ctx.chat, ctx.sender);
    const profileUrl = dashboardUrl(ctx.chat, ctx.sender, '/inventory');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    try {
      const url = new URL('/api/player', base);
      url.searchParams.set('player', playerId);
      const response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });

      if (response.status === 503) {
        return ctx.reply(
          `⚠️ Dashboard dapat dijangkau, tetapi database belum dikonfigurasi.\n${profileUrl}`
        );
      }
      if (!response.ok) {
        return ctx.reply(`⚠️ Dashboard merespons HTTP ${response.status}. Coba lagi setelah memeriksa deployment.\n${profileUrl}`);
      }

      const result = await response.json();
      const player = result?.player;
      if (!player) {
        return ctx.reply(
          `🗺️ API dashboard aktif, tetapi belum ada snapshot untuk karakter ini.\n` +
          `Simpan progres melalui perintah RPG terlebih dahulu.\n${profileUrl}`
        );
      }

      return ctx.reply([
        '🔗 *WHISKAY RPG SYNC*',
        'Status: *Terhubung*',
        `Level: *${number(player.level)}*`,
        `Gold: *${number(player.gold)}*`,
        `Floor: *${number(player.floor)}*`,
        `Update: ${result.updatedAt || player.updatedAt || 'tersedia'}`,
        profileUrl,
      ].join('\n'));
    } catch (error) {
      const reason = error?.name === 'AbortError' ? 'Waktu koneksi habis.' : 'Server dashboard tidak dapat dijangkau.';
      return ctx.reply(`⚠️ ${reason}\nPeriksa DUNGEON_WEBSITE_URL dan deployment website RPG.`);
    } finally {
      clearTimeout(timer);
    }
  },
};

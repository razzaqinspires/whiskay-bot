import { getWorldBossTunnelStatus, restartWorldBossTunnel } from '../../services/worldBossTunnel.js';

function statusText(s) {
  return [
    '☁️ *WHISKAY · WORLD BOSS TUNNEL*',
    `Status: ${s.mode}`,
    `Aktif otomatis: ${s.enabled ? 'ya' : 'tidak'}`,
    `Port lokal: ${s.port}`,
    `Retry: ${s.retryCount}`,
    `URL: ${s.url || '-'}`,
    `Endpoint: ${s.endpoint || '-'}`,
    `Error terakhir: ${s.lastError || '-'}`
  ].join('\n');
}

export default {
  name: 'world-boss-tunnel-control',
  command: ['tunnelstatus', 'tunnelrestart'],
  aliases: ['wbtunnel', 'wbtunnelrestart'],
  category: 'owner',
  description: 'Status dan restart tunnel webhook World Boss',
  cooldown: 5000,
  async execute(ctx) {
    const cmd = String(ctx.command || '').toLowerCase();
    if (cmd === 'tunnelrestart' || cmd === 'wbtunnelrestart') {
      if (!ctx.isOwner) return ctx.reply('🔒 Perintah ini hanya untuk owner bot.');
      await ctx.reply('♻️ Memulai ulang tunnel World Boss. URL publik dapat berubah; tunggu beberapa detik lalu jalankan .tunnelstatus.');
      const s = await restartWorldBossTunnel();
      return ctx.reply(statusText(s));
    }
    return ctx.reply(statusText(getWorldBossTunnelStatus()));
  }
};

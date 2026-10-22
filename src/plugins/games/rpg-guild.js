import { rpgEconomyRequest, economyErrorText } from '../../services/rpgEconomyApi.js';
import { dashboardPlayerId } from '../../services/dungeonWebsiteSync.js';
export default {
  name: 'rpg-guild', command: ['guild'], category: 'games', aliases: ['clan'], cooldown: 1800,
  description: 'Buat guild, bergabung, mengeluarkan anggota, dan donasi Gold',
  async execute(ctx) {
    const action = String(ctx.args?.[0] || 'info').toLowerCase();
    const rest = ctx.args?.slice(1) || [];
    try {
      if (action === 'create') {
        const name = rest.join(' ').trim().slice(0, 32);
        if (!name) return ctx.reply(`🏰 Gunakan: ${ctx.prefix}guild create <nama>
Biaya pembuatan: 10.000 Gold.`);
        const r = await rpgEconomyRequest(ctx, '/api/player/guild', { action, name });
        return ctx.reply(`🏰 *GUILD DIBENTUK*
${r.guild.name}
ID: ${r.guild.id}
Level: ${r.guild.level}
Biaya: 10.000 Gold`);
      }
      if (action === 'join') {
        const guildId = String(rest[0] || '').trim();
        if (!guildId) return ctx.reply(`Gunakan: ${ctx.prefix}guild join <ID_GUILD>`);
        const r = await rpgEconomyRequest(ctx, '/api/player/guild', { action, guildId });
        return ctx.reply(`🤝 Kamu bergabung dengan *${r.guild.name}* (Lv. ${r.guild.level}).`);
      }
      if (action === 'kick') {
        const target = Array.isArray(ctx.mentions) ? ctx.mentions[0] : null;
        if (!target) return ctx.reply(`Gunakan di grup: ${ctx.prefix}guild kick @anggota`);
        const targetId = dashboardPlayerId(ctx.chat, target);
        const r = await rpgEconomyRequest(ctx, '/api/player/guild', { action, targetId });
        return ctx.reply(`👢 Anggota dikeluarkan dari guild *${r.guild.name}*.`);
      }
      if (action === 'donate') {
        const amount = Number(rest[0]);
        if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) return ctx.reply(`Gunakan: ${ctx.prefix}guild donate <jumlah_gold>`);
        const r = await rpgEconomyRequest(ctx, '/api/player/guild', { action, amount });
        return ctx.reply(`💎 Donasi berhasil: ${amount.toLocaleString('id-ID')} Gold untuk *${r.guild.name}*. Treasury: ${Number(r.guild.treasury).toLocaleString('id-ID')} Gold.`);
      }
      if (action === 'info' || action === 'status') {
        const r = await rpgEconomyRequest(ctx, '/api/player/guild', { action: 'info' });
        if (!r.guild) return ctx.reply('🏰 Kamu belum tergabung dalam guild. Gunakan `.guild create <nama>` atau `.guild join <ID_GUILD>`.');
        return ctx.reply(`🏰 *${r.guild.name}*
ID: ${r.guild.id}
Level Guild: ${r.guild.level}
Anggota: ${r.guild.members}
Treasury: ${Number(r.guild.treasury).toLocaleString('id-ID')} Gold`);
      }
      return ctx.reply(`🏰 *GUILD COMMANDS*
.guild create <nama>
.guild join <ID_GUILD>
.guild kick @anggota (leader)
.guild donate <gold>
.guild info`);
    } catch (error) { return ctx.reply(economyErrorText(error)); }
  }
};

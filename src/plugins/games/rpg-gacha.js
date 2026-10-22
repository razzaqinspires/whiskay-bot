import { rpgEconomyRequest, economyErrorText } from '../../services/rpgEconomyApi.js';
export default {
  name: 'rpg-gacha', command: ['gacha'], aliases: ['summon'], category: 'games',
  description: 'Summon equipment acak dengan Gold', cooldown: 2000,
  async execute(ctx) {
    const action = String(ctx.args?.[0] || '').trim().toLowerCase();
    if (['rate', 'rates', 'info'].includes(action)) return ctx.reply('🎲 *EQUIPMENT DROP RATES*\n⚪ Common: 70%\n🔵 Rare: 25%\n🟣 Epic: 5%\n\nBiaya summon: 100 Gold. Gunakan `.gacha` untuk summon equipment.');
    if (action && !['summon', 'equipment', 'equip'].includes(action)) return ctx.reply('Gunakan `.gacha` untuk summon, atau `.gacha rates` untuk melihat drop rate.');
    try {
      const result = await rpgEconomyRequest(ctx, '/api/player/gacha', { count: 1 });
      const item = result.item || {};
      const emoji = item.rarity === 'EPIC' ? '🟣' : item.rarity === 'RARE' ? '🔵' : '⚪';
      return ctx.reply([
        '✨ *WHISKAY EQUIPMENT SUMMON*', '',
        `${emoji} Kamu mendapatkan *${item.name || 'Equipment'}*!`,
        `🏷️ Rarity: *${item.rarity || 'COMMON'}*`,
        `⚔️ Tipe: *${item.slot || item.type || 'equipment'}* · Power: *${Number(item.power || 0)}*`,
        `💸 Biaya: *${Number(result.price || 100).toLocaleString('id-ID')} Gold*`,
        `💰 Sisa Gold: *${Number(result.gold || 0).toLocaleString('id-ID')}*`,
        '', 'Equipment tersimpan di Inventory dashboard.'
      ].join('\n'));
    } catch (error) { return ctx.reply(economyErrorText(error)); }
  }
};

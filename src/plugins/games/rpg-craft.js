import { rpgEconomyRequest, economyErrorText } from '../../services/rpgEconomyApi.js';
export default {
  name: 'rpg-craft', command: ['craft'], aliases: ['crafting'], category: 'games',
  description: 'Craft item dari material dungeon', cooldown: 1500,
  async execute(ctx) {
    const requested = String(ctx.args?.[0] || '').trim().toLowerCase();
    if (!requested || !['potion', 'small-potion', 'potion-small'].includes(requested))
      return ctx.reply('🛠️ *CRAFTING WORKSHOP*\nGunakan: `.craft potion`\nResep: 2× Herb + 1× Ashen Core → 1× Small Potion.');
    try {
      const result = await rpgEconomyRequest(ctx, '/api/player/craft', { item: 'potion-small' });
      return ctx.reply([
        '🛠️ *CRAFT BERHASIL!*', '', '🧪 Small Potion ×1 dibuat.',
        '📦 Material digunakan: 2× Herb, 1× Ashen Core.',
        `🧪 Total Potion di inventory: ${Number(result.quantity || 1)}`,
        '✨ Bahan telah dikurangi secara atomik dari inventory.'
      ].join('\n'));
    } catch (error) { return ctx.reply(economyErrorText(error)); }
  }
};

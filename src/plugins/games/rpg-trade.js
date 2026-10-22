import { dashboardPlayerId } from '../../services/dungeonWebsiteSync.js';
import { rpgEconomyRequest, economyErrorText } from '../../services/rpgEconomyApi.js';
export default {
  name: 'rpg-trade', command: ['trade'], aliases: ['transfer'], category: 'games',
  description: 'Transfer Gold atau item kepada pemain lain di grup', cooldown: 2500,
  async execute(ctx) {
    if (!ctx.isGroup) return ctx.reply('🤝 Trade hanya tersedia di grup WhatsApp agar mention penerima dapat divalidasi.');
    const target = (ctx.mentions || []).find(jid => /@(s\.whatsapp\.net|lid)$/.test(String(jid)));
    if (!target) return ctx.reply('🤝 *PLAYER TRADE*\nTag pemain lalu tentukan aset.\n`.trade @user gold 100`\n`.trade @user potion-small 1`');
    const args = (ctx.args || []).filter(arg => !/^@\d+$/.test(arg));
    // The first token may be a textual @mention; the actual recipient comes from ctx.mentions.
    const mentionIndex = args.findIndex(arg => /^@\d+$/.test(arg));
    const clean = args.filter(arg => !/^@\d+$/.test(arg));
    const kindOrItem = String(clean[0] || '').toLowerCase();
    const amount = Number(clean[1] || 1);
    const isGold = ['gold', 'coin'].includes(kindOrItem);
    const itemId = ({ potion: 'potion-small', 'small-potion': 'potion-small', 'potion-small': 'potion-small', herb: 'material-herb', 'ashen-core': 'ashen-core' })[kindOrItem];
    if ((!isGold && !itemId) || !Number.isSafeInteger(amount) || amount < 1 || amount > 1000000)
      return ctx.reply('Format: `.trade @user gold 100` atau `.trade @user potion-small 1`. Item harus berupa ID item yang didukung.');
    const fromId = dashboardPlayerId(ctx.chat, ctx.sender);
    const toId = dashboardPlayerId(ctx.chat, target);
    if (fromId === toId) return ctx.reply('🤝 Kamu tidak bisa melakukan trade ke diri sendiri.');
    try {
      const result = await rpgEconomyRequest(ctx, '/api/player/trade', {
        recipientId: toId, kind: isGold ? 'gold' : 'item', itemId: isGold ? undefined : itemId, amount
      });
      return ctx.reply([
        '🤝 *TRADE BERHASIL!*', '',
        `📤 Aset dikirim: *${isGold ? `${amount.toLocaleString('id-ID')} Gold` : `${itemId} ×${amount}`}*`,
        `📥 Penerima: @${String(target).split('@')[0]}`,
        isGold ? `💰 Saldo Gold kamu: *${Number(result.senderGold || 0).toLocaleString('id-ID')}*` : '🎒 Inventory diperbarui untuk kedua pemain.',
        '🔐 Transfer diproses atomik oleh server.'
      ].join('\n'), { mentions: [target] });
    } catch (error) { return ctx.reply(economyErrorText(error)); }
  }
};

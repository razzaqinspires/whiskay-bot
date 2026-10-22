import { rpgEconomyRequest, economyErrorText } from '../../services/rpgEconomyApi.js';
export default {
  name: 'rpg-auction', command: ['auction'], category: 'games', cooldown: 2500,
  description: 'Pasar lelang global untuk menjual dan membeli loot menggunakan Gold',
  async execute(ctx) {
    const [actionRaw, ...rest] = ctx.args || []; const action = String(actionRaw || 'list').toLowerCase();
    if (!['sell','list','buy','help'].includes(action)) return ctx.reply('Format: .auction sell <item-id> <harga> | .auction list | .auction buy <id>');
    if (action === 'help') return ctx.reply('🏛️ *GLOBAL AUCTION HOUSE*\n.auction sell <item-id> <harga> — pasang loot dari inventory\n.auction list — lihat listing aktif\n.auction buy <id> — beli listing dengan Gold\n\nItem harus ada di inventory. Listing dan transfer diproses server-side.');
    try {
      if (action === 'sell') {
        const itemId = String(rest[0] || '').trim().toLowerCase(); const price = Number(rest[1]);
        if (!/^[a-z0-9_-]{2,64}$/.test(itemId) || !Number.isSafeInteger(price) || price < 1 || price > 100000000) return ctx.reply('Format: .auction sell <item-id> <harga-Gold>');
        const result = await rpgEconomyRequest(ctx, '/api/player/auction', { action, itemId, price });
        return ctx.reply(`🏷️ Listing dibuat! ID: *${result.listing.id}*\nItem: ${result.listing.itemId}\nHarga: ${Number(result.listing.price).toLocaleString('id-ID')} Gold`);
      }
      if (action === 'buy') {
        const id = String(rest[0] || '').trim(); if (!/^[a-f0-9-]{8,64}$/i.test(id)) return ctx.reply('Format: .auction buy <id-listing>');
        const result = await rpgEconomyRequest(ctx, '/api/player/auction', { action, listingId: id });
        return ctx.reply(`✅ Pembelian berhasil: *${result.itemId}*\nHarga: ${Number(result.price).toLocaleString('id-ID')} Gold\nSaldo: ${Number(result.gold).toLocaleString('id-ID')} Gold`);
      }
      const result = await rpgEconomyRequest(ctx, '/api/player/auction', { action: 'list' });
      const rows = result.listings || [];
      return ctx.reply(rows.length ? `🏛️ *GLOBAL AUCTION HOUSE*\n${rows.slice(0,20).map(x=>`• ID: ${x.id} | ${x.itemId} | ${Number(x.price).toLocaleString('id-ID')} Gold`).join('\n')}\n\nBeli: .auction buy <id>` : '🏛️ Belum ada listing lelang aktif.');
    } catch (error) { return ctx.reply(economyErrorText(error)); }
  }
};

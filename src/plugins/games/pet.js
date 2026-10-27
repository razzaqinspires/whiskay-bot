import { rpgEconomyRequest, economyErrorText } from '../../services/rpgEconomyApi.js';
const help = '🐾 *WHISKAY COMPANION*\n.hatch — menetaskan telur pet (cooldown 12 jam)\n.mypet — melihat pet dan statistiknya\n.feed [item-id] — memberi makan dari inventory web RPG\n\nPet tersimpan di database RPG; perintah .feed memperbarui snapshot yang dipakai web.';
export default {
  name: 'virtual-pet', command: ['hatch','feed','mypet','pet'], category: 'games', cooldown: 1800,
  description: 'Virtual companion lintas bot dan web RPG',
  async execute(ctx) {
    const action = String(ctx.command || '').toLowerCase();
    if (action === 'pet') return ctx.reply(help);
    try {
      if (action === 'hatch') {
        const result = await rpgEconomyRequest(ctx, '/api/player/pet', { action: 'hatch' });
        return ctx.reply(`🥚 *TELUR BERHASIL MENETAS!*\n🐾 Pet: ${result.pet?.name || result.pet?.species || 'Companion'}\n❤️ Lapar: ${result.pet?.hunger ?? 100}/100\n⚡ Energi: ${result.pet?.energy ?? 100}/100\n
Pet tersimpan di database RPG dan akan muncul di web saat snapshot tersinkronisasi.`);
      }
      if (action === 'feed') {
        const itemId = String(ctx.args?.[0] || 'pet-food').trim().toLowerCase().slice(0, 64);
        const result = await rpgEconomyRequest(ctx, '/api/player/pet', { action: 'feed', itemId });
        return ctx.reply(`🍖 *PET SUDAH DIBERI MAKAN*\nItem: ${result.itemName || itemId}\n❤️ Lapar: ${result.pet?.hunger ?? 100}/100\n⚡ Energi: ${result.pet?.energy ?? 100}/100\n✅ Database diperbarui; web menerima perubahan melalui sync/realtime jika konfigurasi Supabase aktif.`);
      }
      const result = await rpgEconomyRequest(ctx, '/api/player/pet', { action: 'status' });
      if (!result.pet) return ctx.reply(`🐣 Kamu belum punya pet. Gunakan .hatch untuk menetaskan telur.\n${help}`);
      const p = result.pet;
      const hunger = Math.max(0, Math.min(100, Number(p.hunger ?? 100)));
      const energy = Math.max(0, Math.min(100, Number(p.energy ?? 100)));
      return ctx.reply(`🐾 *MY VIRTUAL PET*\nNama: ${p.name || p.species}\nJenis: ${p.species}\n❤️ Kenyang: ${hunger}/100 ${hunger < 30 ? '· perlu makan!' : ''}\n⚡ Energi: ${energy}/100\n✨ Buff: ${p.active === false ? 'nonaktif' : 'Movement Speed +8%'}\n
Gunakan .feed [item-id] untuk memberi makan dari inventory web RPG.`);
    } catch (error) { return ctx.reply(economyErrorText(error) + '\n\nJika fitur baru saja dipasang, pastikan website RPG sudah dideploy dengan endpoint /api/player/pet dan token server sama.'); }
  }
};

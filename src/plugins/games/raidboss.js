import { getEnergy } from '../../lib/energy-worker.js';
export default {
  name: 'raidboss', command: ['raidboss'], menuCommands: ['raidboss'], category: 'games',
  description: 'Mulai simulasi raid boss berbiaya energi tinggi; tidak dapat dijalankan saat charging',
  energyMode: 'static', energyCost: 10, cooldown: 30000,
  async execute(ctx) {
    const energy = await getEnergy(ctx.sender || ctx.chat);
    if (energy.isCharging) return ctx.reply('⚠️ Peringatan CPU: Cabut charger Anda terlebih dahulu untuk menjalankan tugas berat ini!');
    if (energy.energy < 10) return ctx.reply(`Energi tidak cukup untuk Raid Boss. Dibutuhkan 10%; tersedia ${energy.energy.toFixed(2)}%.`);
    return ctx.sendInteractive({
      title: '⚔️ WORLD RAID · SIMULASI',
      subtitle: 'Heavy task accepted',
      body: 'Raid Boss telah dimulai sebagai event simulasi. Sinkronkan progres game melalui checkpoint website untuk pertarungan yang otoritatif.',
      buttons: [
        { name: 'quick_reply', title: 'Status Baterai', id: `${ctx.prefix}statusbaterai` },
        { name: 'quick_reply', title: 'Profil RPG', id: `${ctx.prefix}profile` }
      ]
    });
  }
};

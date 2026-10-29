import { registry } from '../../core/registry.js';
import { formatOfflineStatus, normalizeOfflineStatus } from '../../lib/offline-mode.js';

const clean = value => String(value || '').replace(/[\r\n\u0000-\u001f]/g, ' ').trim().slice(0, 240);
export default {
  name: 'owner-offline-mode',
  command: ['offline', 'online', 'offlinestatus'],
  category: 'owner', owner: true, energyMode: 'free', energyCost: 0, cooldown: 1000,
  description: 'Atur mode offline bot, simpan alasan, dan lihat status',
  async execute(ctx) {
    if (!ctx.isOwner) return ctx.reply('🔒 Perintah ini khusus owner.');
    const command = String(ctx.command || '').toLowerCase();
    const store = registry.runtimeState;
    if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') {
      return ctx.reply('❌ Penyimpanan runtime belum tersedia; status tidak diubah.');
    }
    const current = normalizeOfflineStatus(store.get('offlineMode', null));
    if (command === 'offlinestatus') return ctx.reply(formatOfflineStatus(current));
    if (command === 'offline') {
      const reason = clean((ctx.args || []).join(' ')) || 'Sedang pemeliharaan';
      const status = { enabled: true, reason, since: Date.now(), changedBy: String(ctx.sender || '').slice(0, 120) };
      store.set('offlineMode', status);
      return ctx.reply(`🔴 *MODE OFFLINE DIAKTIFKAN*\nAlasan: ${reason}\n\nPengguna non-owner tidak dapat menjalankan command sampai mode online diaktifkan. Owner tetap dapat mengelola bot.\nCek status: ${ctx.prefix || '.'}offlinestatus\nPulihkan: ${ctx.prefix || '.'}online`);
    }
    store.set('offlineMode', { enabled: false });
    return ctx.reply(current ? '🟢 *MODE ONLINE DIAKTIFKAN.* Command pengguna kembali tersedia.' : 'ℹ️ Bot sudah dalam mode ONLINE.');
  }
};

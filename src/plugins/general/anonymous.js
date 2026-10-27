import { addAnonymousToQueue, getAnonymousPartner, stopAnonymous, getAnonymousQueueStatus } from '../../lib/app-database.js';
import { registry } from '../../core/registry.js';
const safeText = value => String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 3000);
export async function relayAnonymousMessage(ctx) {
  if (ctx.isGroup || !ctx.sender || ctx.isBot || !ctx.body) return false;
  const partner = await getAnonymousPartner(ctx.sender);
  if (!partner) return false;
  const text = safeText(ctx.body);
  if (!text) return false;
  const sock = ctx.sock || registry.sock || registry.bot?.sock;
  if (!sock?.sendMessage) return false;
  try { await sock.sendMessage(partner, { text: `💬 Pesan anonim:\n\n${text}\n\nGunakan .anon stop untuk mengakhiri.` }); }
  catch { await stopAnonymous(ctx.sender); await ctx.reply('Partner tidak dapat dijangkau. Sesi anonim dihentikan.').catch(() => {}); }
  return true;
}
export default {
  name: 'anonymous-chat', command: ['anon','anonymous','anonim'], category: 'social', cooldown: 1200,
  description: 'Chat anonim dengan pasangan acak yang terdaftar',
  async execute(ctx) {
    if (ctx.isGroup) return ctx.reply('🔒 Chat anonim hanya tersedia di chat pribadi.');
    const action = String(ctx.args?.[0] || 'start').toLowerCase();
    if (action === 'stop' || action === 'end') {
      const result = await stopAnonymous(ctx.sender);
      if (result.partner) await ctx.sock.sendMessage(result.partner, { text: 'ℹ️ Partner mengakhiri chat anonim. Gunakan .anon next untuk mencari partner baru.' }).catch(() => {});
      return ctx.reply('Sesi anonim dihentikan. Gunakan .anon next untuk mencari partner baru.');
    }
    if (action === 'next' || action === 'start') {
      const existing = await getAnonymousPartner(ctx.sender);
      if (existing) {
        await stopAnonymous(ctx.sender);
        await ctx.sock.sendMessage(existing, { text: 'ℹ️ Partner mengakhiri sesi anonim.' }).catch(() => {});
      }
      const result = await addAnonymousToQueue(ctx.sender);
      if (result.status === 'paired') {
        await ctx.sock.sendMessage(result.partner, { text: '🎭 Partner anonim ditemukan! Mulai ngobrol. Identitas nomor tidak dibagikan oleh fitur ini.' }).catch(() => {});
        return ctx.reply('🎭 Partner ditemukan! Mulai ngobrol. Gunakan .anon stop untuk selesai atau .anon next untuk ganti partner.');
      }
      return ctx.reply('⏳ Kamu masuk antrean anonim. Bot akan memberi tahu saat partner tersedia. Gunakan .anon stop untuk membatalkan.');
    }
    if (action === 'status') {
      const s = await getAnonymousQueueStatus(ctx.sender);
      return ctx.reply(s.partner ? '🟢 Chat anonim sedang aktif.' : s.waiting ? '🟡 Menunggu partner anonim.' : '⚪ Tidak ada sesi anonim. Gunakan .anon start.');
    }
    return ctx.reply('🎭 *CHAT ANONIM*\n.anon start — cari partner\n.anon next — ganti partner\n.anon status — cek sesi\n.anon stop — akhiri sesi\n\nJangan kirim data pribadi kepada orang yang tidak dikenal.');
  }
};

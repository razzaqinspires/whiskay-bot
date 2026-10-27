import { registerUser, getUser, getUserStats, createTopup, approveTopup, getPendingTopups } from '../../lib/app-database.js';
import config from '../../config/index.js';
const money = n => new Intl.NumberFormat('id-ID').format(Number(n) || 0);
export default {
  name: 'account', command: ['daftar','register','statusdaftar','saldo','topup','topuppending','topupapprove','userstats'],
  menuCommands: ['daftar','saldo','topup'], category: 'account', cooldown: 1200,
  description: 'Registrasi pengguna, saldo internal, top-up manual dan statistik pengguna',
  async execute(ctx) {
    const cmd = ctx.command, id = ctx.sender || ctx.chat, args = ctx.args || [];
    if (cmd === 'daftar' || cmd === 'register') {
      const user = await registerUser(id, ctx.pushName);
      return ctx.reply(`✅ *Registrasi berhasil*\nNama: ${user.pushName}\nStatus: Terdaftar\nSaldo: Rp${money(user.balance)}\n\nGunakan .saldo untuk melihat saldo dan .topup 10000 untuk membuat permintaan top-up.`);
    }
    if (cmd === 'statusdaftar') {
      const user = await getUser(id);
      return ctx.reply(user?.registered ? `✅ Terdaftar sejak ${new Date(user.registeredAt).toLocaleDateString('id-ID')}.` : '❌ Kamu belum terdaftar. Gunakan .daftar.');
    }
    if (cmd === 'saldo') {
      const user = await getUser(id);
      if (!user?.registered) return ctx.reply('Daftar terlebih dahulu dengan .daftar.');
      return ctx.reply(`💳 *SALDO WHISKAY*\nSaldo: *Rp${money(user.balance)}*\nStatus: ${user.banned ? 'Diblokir' : 'Aktif'}\n\nTop-up: .topup 10000`);
    }
    if (cmd === 'topup') {
      const amount = Number(args[0]);
      try {
        const tx = await createTopup(id, amount, 'manual');
        const methods = [];
        const pay = await import('../../lib/energy-worker.js').then(m => m.getPaymentConfig()).catch(() => ({}));
        for (const group of ['bank','ewallet']) for (const item of pay[group] || []) methods.push(`• ${item.name}: ${item.number} a.n. ${item.owner}`);
        if (pay.qrisPath) methods.push('• QRIS tersedia; minta instruksi/QR kepada owner.');
        const ownerIds = config.owners || [];
        for (const owner of ownerIds) await ctx.sock.sendMessage(owner, { text: `💳 TOP-UP SALDO\nUser: ${id}\nRef: ${tx.id}\nNominal: Rp${money(tx.amount)}\nApprove setelah dana benar-benar diterima: .topupapprove ${tx.id}` }).catch(() => {});
        return ctx.reply(`🧾 *PERMINTAAN TOP-UP*\nReferensi: ${tx.id}\nNominal: Rp${money(tx.amount)}\nStatus: Menunggu verifikasi owner\n\n${methods.join('\n') || 'Metode pembayaran belum dikonfigurasi. Hubungi owner.'}\n\nSaldo belum bertambah sampai pembayaran diverifikasi.`);
      } catch (e) { return ctx.reply(`❌ ${e.message}`); }
    }
    if (cmd === 'topuppending') {
      if (!ctx.isOwner) return ctx.reply('Owner only.');
      const rows = await getPendingTopups();
      return ctx.reply('📋 *TOP-UP PENDING*\n' + (rows.map(t => `${t.id} · ${t.user} · Rp${money(t.amount)}`).join('\n') || 'Tidak ada transaksi pending.'));
    }
    if (cmd === 'topupapprove') {
      if (!ctx.isOwner) return ctx.reply('Owner only.');
      try {
        const result = await approveTopup(args[0], id);
        await ctx.sock.sendMessage(result.user.id, { text: `✅ Top-up ${result.transaction.id} disetujui. Saldo baru: Rp${money(result.user.balance)}.` }).catch(() => {});
        return ctx.reply(`Top-up berhasil diverifikasi. Saldo ${result.user.id}: Rp${money(result.user.balance)}.`);
      } catch (e) { return ctx.reply(`❌ ${e.message}`); }
    }
    if (cmd === 'userstats') {
      if (!ctx.isOwner) return ctx.reply('Owner only.');
      const stats = await getUserStats();
      return ctx.reply(`👥 *STATISTIK USER*\nTerekam: ${stats.total}\nTerdaftar: ${stats.registered}\nDiblokir: ${stats.banned}`);
    }
  }
};

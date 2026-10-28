import { createMenfessSession, recordMenfessMessage, endMenfessSession } from '../../services/menfessEngine.js';
export default {
  name: 'menfess', command: ['menfess'], aliases: ['mf'], category: 'social', description: 'Kirim pesan anonim dengan sesi terbatas', cooldown: 5000,
  async execute(ctx) {
    const args = Array.isArray(ctx.args) ? ctx.args : [];
    const sub = String(args[0] || 'help').toLowerCase();
    if (sub === 'help') return ctx.reply('💌 MENFESS\n.menfess send <nomor> <pesan>\n.menfess end <id-sesi> (pengirim/penerima)\nSesi memiliki masa berlaku 24 jam dan batas pembuatan. Jangan kirim ancaman, spam, atau data sensitif.');
    if (sub === 'send') {
      const target = args[1]; const text = args.slice(2).join(' ').trim();
      if (!target || !text) return ctx.reply('Format: .menfess send <nomor> <pesan>');
      try {
        const session = createMenfessSession({ sender: ctx.sender, target, alias: 'Anonim', text });
        const sock = ctx.sock || ctx.client;
        if (!sock?.sendMessage) throw new Error('Koneksi WhatsApp belum siap.');
        const sent = await sock.sendMessage(session.target, { text: `💌 *MENFESS ANONIM*\nDari: ${session.alias}\n\n${text}\n\nBalas pesan ini untuk membalas secara anonim. Ketik .menfess end ${session.id} untuk mengakhiri sesi.` });
        const messageId = sent?.key?.id;
        if (messageId) recordMenfessMessage(session.id, messageId);
        return ctx.reply(`Menfess terkirim. ID sesi: ${session.id.slice(0, 8)}. Sesi aktif hingga 24 jam atau dihentikan salah satu pihak.`);
      } catch (error) { return ctx.reply(`Menfess gagal: ${error.message}`); }
    }
    if (sub === 'end') {
      const id = String(args[1] || '');
      const session = endMenfessSession(id, ctx.sender);
      if (!session) return ctx.reply('Sesi tidak ditemukan, sudah berakhir, atau kamu bukan bagian dari sesi tersebut.');
      const sock = ctx.sock || ctx.client;
      for (const jid of [session.sender, session.target]) { try { await sock.sendMessage(jid, { text: '🔒 Sesi Menfess telah diakhiri oleh salah satu pihak.' }); } catch {} }
      return ctx.reply('Sesi Menfess berhasil diakhiri.');
    }
    return ctx.reply('Subperintah tidak dikenal. Gunakan .menfess help.');
  }
};

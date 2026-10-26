export default {
  name: 'group-moderation', command: ['kick','add','promote','demote','linkgroup'], category: 'group',
  description: 'Moderasi grup WhatsApp: kick, add, promote, demote, linkgroup', group: true,
  async execute(ctx) {
    if (!ctx.isGroup || !String(ctx.chat || '').endsWith('@g.us')) return ctx.reply('Perintah ini hanya dapat digunakan di grup.');
    const sock = ctx.sock, group = ctx.chat;
    let metadata;
    try { metadata = await sock.groupMetadata(group); }
    catch { return ctx.reply('❌ Tidak dapat membaca metadata grup. Coba lagi beberapa saat.'); }
    const participants = Array.isArray(metadata?.participants) ? metadata.participants : [];
    const isAdmin = p => p?.admin === 'admin' || p?.admin === 'superadmin';
    const caller = participants.find(p => p.id === ctx.sender || p.phoneNumber === ctx.sender);
    const botId = sock.user?.id || '';
    const botParticipant = participants.find(p => p.id === botId || (p.id && botId && p.id.split('@')[0].split(':')[0] === botId.split('@')[0].split(':')[0]));
    if (!ctx.isOwner && !isAdmin(caller)) return ctx.reply('🔒 Hanya admin grup atau owner bot yang dapat menggunakan perintah moderasi.');
    if (!isAdmin(botParticipant)) return ctx.reply('⚠️ Bot harus menjadi admin grup terlebih dahulu.');
    const mentioned = Array.isArray(ctx.mentions) ? ctx.mentions : [];
    const target = mentioned[0] || (ctx.args?.[0] ? `${String(ctx.args[0]).replace(/\D/g,'')}@s.whatsapp.net` : '');
    try {
      if (ctx.command === 'linkgroup') {
        const code = await sock.groupInviteCode(group);
        return ctx.reply(`🔗 Tautan grup: https://chat.whatsapp.com/${code}`);
      }
      if (ctx.command === 'add') {
        const number = String(ctx.args?.[0] || '').replace(/\D/g, '');
        if (number.length < 7 || number.length > 15) return ctx.reply('Format: .add 628xxxxxxxxxx');
        const result = await sock.groupParticipantsUpdate(group, [`${number}@s.whatsapp.net`], 'add');
        return ctx.reply(`Permintaan tambah anggota diproses. Status: ${JSON.stringify(result).slice(0,500)}`);
      }
      if (!target || !target.includes('@')) return ctx.reply(`Format: .${ctx.command} @anggota`);
      if (target === ctx.sender) return ctx.reply('Kamu tidak dapat menjalankan tindakan ini pada diri sendiri.');
      const action = ({kick:'remove',promote:'promote',demote:'demote'})[ctx.command];
      const result = await sock.groupParticipantsUpdate(group, [target], action);
      return sock.sendMessage(group,{text:`✅ Perintah ${ctx.command} diproses untuk @${target.split('@')[0]}.`,mentions:[target]},{quoted:ctx.raw || ctx});
    } catch (error) {
      return ctx.reply(`❌ Gagal menjalankan ${ctx.command}. Pastikan bot admin, target valid, dan grup mengizinkan tindakan ini.`);
    }
  }
};

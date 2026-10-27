import { getGroupSettings, updateGroupSettings } from '../../lib/group-settings.js';
import { sameUser } from '../../lib/security.js';

const isAdminParticipant = (p) => p?.admin === 'admin' || p?.admin === 'superadmin';
const digits = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
const fmtDate = (seconds) => seconds ? new Date(Number(seconds) * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '-';

async function groupContext(ctx, requireAdmin = false, requireBotAdmin = false) {
  if (!ctx.isGroup || !String(ctx.chat || '').endsWith('@g.us')) {
    await ctx.reply('Perintah ini hanya dapat digunakan di grup WhatsApp.');
    return null;
  }
  const metadata = await ctx.sock.groupMetadata(ctx.chat);
  const participants = Array.isArray(metadata?.participants) ? metadata.participants : [];
  const callerIds = [ctx.sender, ctx.raw?.key?.participant, ctx.raw?.key?.participantAlt, ctx.raw?.key?.participantPn].filter(Boolean).map(String);
  const caller = participants.find(p => [p.id, p.jid, p.lid, p.phoneNumber].filter(Boolean).some(id => callerIds.some(candidate => sameUser(id, candidate))));
  const botIds = [ctx.sock.user?.id, ctx.sock.user?.lid].filter(Boolean).map(String);
  const bot = participants.find(p => [p.id, p.jid, p.lid, p.phoneNumber].filter(Boolean).some(id => botIds.some(candidate => sameUser(id, candidate))));
  const callerAdmin = Boolean(ctx.isOwner || ctx.isAdmin || isAdminParticipant(caller));
  const botAdmin = isAdminParticipant(bot);
  if (requireAdmin && !callerAdmin) {
    await ctx.reply('🔒 Hanya admin grup atau owner bot yang dapat menggunakan perintah ini.');
    return null;
  }
  if (requireBotAdmin && !botAdmin) {
    await ctx.reply('⚠️ Jadikan bot admin grup terlebih dahulu agar tindakan ini dapat dilakukan.');
    return null;
  }
  return { metadata, participants, callerAdmin, botAdmin };
}

const boolWord = value => ['on', 'aktif', 'yes', 'true'].includes(String(value || '').toLowerCase());

export default {
  name: 'group-tools',
  command: [
    'grouphelp', 'groupinfo', 'admins', 'tagall', 'hidetag',
    'revoke', 'setsubject', 'setdesc', 'closegroup', 'opengroup',
    'antilink', 'antispam', 'welcome', 'setwelcometext'
  ],
  category: 'group',
  description: 'Perangkat grup: info, tag, pengaturan grup, anti-link, anti-spam, welcome',
  group: true,
  cooldown: 2500,
  async execute(ctx) {
    const cmd = String(ctx.command || '').toLowerCase();
    if (cmd === 'grouphelp') {
      return ctx.reply(
        '👥 *PANDUAN GRUP WHISKAY*\n\n' +
        'Info: .groupinfo · .admins\n' +
        'Mention: .tagall [pesan] · .hidetag [pesan]\n' +
        'Grup: .revoke · .setsubject nama · .setdesc deskripsi · .closegroup · .opengroup\n' +
        'Keamanan: .antilink on|off|status · .antispam on|off|status\n' +
        'Anggota: .welcome on|off|status · .setwelcometext pesan\n\n' +
        'Pengaturan anti-link dan anti-spam disimpan per grup. Bot harus menjadi admin agar dapat menghapus pesan pelanggaran.'
      );
    }

    const adminCommands = new Set(['tagall','hidetag','revoke','setsubject','setdesc','closegroup','opengroup','antilink','antispam','welcome','setwelcometext']);
    const botAdminCommands = new Set(['revoke','setsubject','setdesc','closegroup','opengroup']);
    const group = await groupContext(ctx, adminCommands.has(cmd), botAdminCommands.has(cmd));
    if (!group) return;

    const { metadata, participants } = group;
    const admins = participants.filter(isAdminParticipant);
    const memberJids = participants.map(p => p.id).filter(id => typeof id === 'string' && id.includes('@'));
    const settings = await getGroupSettings(ctx.chat);

    if (cmd === 'groupinfo') {
      const description = String(metadata.desc || '').slice(0, 500) || '(belum ada deskripsi)';
      return ctx.reply(
        `👥 *INFO GRUP*\nNama: ${metadata.subject || '-'}\nID: ${ctx.chat}\nAnggota: ${participants.length}\nAdmin: ${admins.length}\nDibuat: ${fmtDate(metadata.creation)}\nAnti-link: ${settings.antilink ? 'ON' : 'OFF'}\nAnti-spam: ${settings.antispam ? 'ON' : 'OFF'}\nWelcome: ${settings.welcome ? 'ON' : 'OFF'}\n\nDeskripsi: ${description}`
      );
    }
    if (cmd === 'admins') {
      const mentions = admins.map(p => p.id).filter(Boolean);
      return ctx.sock.sendMessage(ctx.chat, {
        text: `🛡️ *ADMIN GRUP (${mentions.length})*\n${mentions.map((id, i) => `${i + 1}. @${digits(id)}`).join('\n') || 'Tidak ditemukan admin.'}`,
        mentions
      }, { quoted: ctx.raw || ctx });
    }
    if (cmd === 'tagall' || cmd === 'hidetag') {
      if (!memberJids.length) return ctx.reply('Daftar anggota grup tidak tersedia.');
      const text = String(ctx.args?.join(' ') || (cmd === 'tagall' ? 'Perhatian semua anggota.' : '📢 Pengumuman grup')).slice(0, 1000);
      const body = cmd === 'tagall'
        ? `📣 *TAG ALL*\n${text}\n\n${memberJids.map(id => `@${digits(id)}`).join(' ')}`
        : `📢 *PENGUMUMAN GRUP*\n${text}`;
      return ctx.sock.sendMessage(ctx.chat, { text: body, mentions: memberJids }, { quoted: ctx.raw || ctx });
    }
    if (cmd === 'revoke') {
      const code = await ctx.sock.groupRevokeInvite(ctx.chat);
      return ctx.reply(`🔐 Tautan undangan lama telah dicabut.\nTautan baru: https://chat.whatsapp.com/${code}`);
    }
    if (cmd === 'setsubject') {
      const subject = String(ctx.args?.join(' ') || '').trim();
      if (!subject) return ctx.reply('Format: .setsubject Nama Grup Baru');
      await ctx.sock.groupUpdateSubject(ctx.chat, subject.slice(0, 100));
      return ctx.reply('✅ Nama grup berhasil diperbarui.');
    }
    if (cmd === 'setdesc') {
      const desc = String(ctx.args?.join(' ') || '').trim();
      if (!desc) return ctx.reply('Format: .setdesc Deskripsi grup');
      await ctx.sock.groupUpdateDescription(ctx.chat, desc.slice(0, 2048));
      return ctx.reply('✅ Deskripsi grup berhasil diperbarui.');
    }
    if (cmd === 'closegroup' || cmd === 'opengroup') {
      await ctx.sock.groupSettingUpdate(ctx.chat, cmd === 'closegroup' ? 'announcement' : 'not_announcement');
      return ctx.reply(cmd === 'closegroup'
        ? '🔒 Grup ditutup: hanya admin yang dapat mengirim pesan.'
        : '🔓 Grup dibuka: semua anggota dapat mengirim pesan.');
    }
    if (['antilink', 'antispam', 'welcome'].includes(cmd)) {
      const mode = String(ctx.args?.[0] || 'status').toLowerCase();
      if (!['on','off','status','aktif','nonaktif'].includes(mode)) {
        return ctx.reply(`Format: .${cmd} on|off|status`);
      }
      const key = cmd;
      if (mode !== 'status') {
        const enabled = boolWord(mode);
        await updateGroupSettings(ctx.chat, { [key]: enabled });
        const note = key === 'antilink' && enabled
          ? '\nPastikan bot admin agar pesan tautan anggota non-admin dapat dihapus.'
          : '';
        return ctx.reply(`✅ ${cmd} ${enabled ? 'diaktifkan' : 'dinonaktifkan'} untuk grup ini.${note}`);
      }
      return ctx.reply(`⚙️ *PENGATURAN GRUP*\nAnti-link: ${settings.antilink ? 'ON' : 'OFF'}\nAnti-spam: ${settings.antispam ? 'ON' : 'OFF'}\nWelcome: ${settings.welcome ? 'ON' : 'OFF'}`);
    }
    if (cmd === 'setwelcometext') {
      const text = String(ctx.args?.join(' ') || '').trim();
      if (!text) return ctx.reply('Format: .setwelcometext Selamat datang {user} di {group}!');
      await updateGroupSettings(ctx.chat, { welcomeText: text });
      return ctx.reply('✅ Teks welcome disimpan. Placeholder yang didukung: {user}, {group}.');
    }
  }
};

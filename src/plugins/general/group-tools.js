import { getGroupSettings, updateGroupSettings } from '../../lib/group-settings.js';
import { isOwner, sameUser } from '../../lib/security.js';

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
    'revoke', 'resetlink', 'linkgc', 'setsubject', 'setname', 'setdesc', 'setdescription', 'closegroup', 'opengroup', 'open', 'close', 'locked', 'unlocked', 'group',
    'antilink', 'antispam', 'welcome', 'setwelcometext',
    'ephemeral', 'bancmd', 'unbancmd', 'groupschedule', 'setleavetext',
    'totag', 'tohidetag', 'inviteinfo', 'setppgc', 'getpp', 'getppgc', 'infogc', 'infogroup', 'blacklist', 'unblacklist', 'absen', 'pinchat', 'pinpesan'
  ],
  menuCommands: ['grouphelp','groupinfo','admins','tagall','hidetag','revoke','resetlink','linkgc','setsubject','setname','setdesc','setdescription','closegroup','opengroup','open','close','locked','unlocked','group','antilink','antispam','welcome','setwelcometext','ephemeral','bancmd','unbancmd','groupschedule','setleavetext','totag','tohidetag','inviteinfo','setppgc','getpp','getppgc','infogc','infogroup','blacklist','unblacklist','absen','pinchat','pinpesan'],
  menuDescriptions: { grouphelp:'Panduan command grup', groupinfo:'Informasi grup', admins:'Daftar admin grup', tagall:'Mention semua anggota', hidetag:'Kirim pesan tanpa menampilkan daftar mention', revoke:'Reset tautan undangan', linkgc:'Ambil tautan grup', setsubject:'Ubah nama grup', setdesc:'Ubah deskripsi grup', closegroup:'Batasi pesan grup', opengroup:'Buka pesan grup', antilink:'Pengaturan anti-link', antispam:'Pengaturan anti-spam', welcome:'Pengaturan pesan sambutan', groupschedule:'Jadwal buka/tutup grup', ephemeral:'Atur pesan sementara', absen:'Absensi anggota grup', pinchat:'Pin pesan sementara', blacklist:'Blacklist anggota grup', unblacklist:'Hapus blacklist anggota' },
  category: 'group',
  description: 'Perangkat grup: info, tag, pengaturan grup, anti-link, anti-spam, welcome',
  group: true,
  cooldown: 2500,
  async execute(ctx) {
    const rawCommand = String(ctx.command || '').toLowerCase();
    const rawArgs = Array.isArray(ctx.args) ? ctx.args : [];
    const aliases = { resetlink: 'revoke', linkgc: 'linkgc', setname: 'setsubject', setdescription: 'setdesc', close: 'closegroup', open: 'opengroup', infogc: 'groupinfo', infogroup: 'groupinfo' };
    let cmd = aliases[rawCommand] || rawCommand;
    if (rawCommand === 'group') {
      const subcommand = String(rawArgs[0] || '').toLowerCase();
      const groupAliases = { open: 'opengroup', buka: 'opengroup', close: 'closegroup', tutup: 'closegroup', link: 'linkgc', linkgc: 'linkgc', resetlink: 'revoke', revoke: 'revoke', locked: 'locked', unlocked: 'unlocked', setname: 'setsubject', setsubject: 'setsubject', setdesc: 'setdesc', setdescription: 'setdesc' };
      cmd = groupAliases[subcommand] || '';
      ctx.args = rawArgs.slice(1);
      if (!cmd) return ctx.reply('Format: .group open|close|link|resetlink|locked|unlocked|setname <nama>|setdesc <deskripsi>');
    }
    if (cmd === 'grouphelp') {
      const row = (command, description) => ({ title: `.${command}`, description, id: `${ctx.prefix || '.'}${command}` });
      return ctx.sendInteractive({
        title: '👥 PANDUAN GRUP WHISKAY',
        subtitle: 'Pilih command dari daftar — semua command juga tercantum di .menu',
        body: 'Pilih fitur grup dari menu interaktif ini. Beberapa tindakan membutuhkan admin grup; perubahan nama, deskripsi, tautan, dan pengaturan grup juga memerlukan bot sebagai admin.',
        buttons: [{ name: 'single_select', title: '📋 Lihat Command Grup', sections: [
          { title: 'Info & Mention', rows: [row('groupinfo','Lihat informasi grup'),row('admins','Daftar admin'),row('getppgc','Foto profil grup'),row('getpp','Foto profil pengguna · reply/mention'),row('tagall','Mention semua anggota'),row('hidetag','Mention tersembunyi'),row('totag','Ubah pesan reply menjadi mention'),row('tohidetag','Kirim ulang pesan reply dengan hidetag')] },
          { title: 'Pengaturan Grup', rows: [row('linkgc','Ambil tautan undangan'),row('revoke','Reset tautan undangan'),row('setsubject','Ubah nama grup · sertakan nama'),row('setdesc','Ubah deskripsi · sertakan teks'),row('closegroup','Tutup pengiriman pesan'),row('opengroup','Buka pengiriman pesan'),row('locked','Periksa status grup terkunci'),row('unlocked','Periksa status grup terbuka'),row('ephemeral','Atur pesan sementara · off/24h/7d/90d'),row('setppgc','Ubah foto grup · reply foto')] },
          { title: 'Keamanan & Anggota', rows: [row('antilink','Anti-link · on/off/status'),row('antispam','Anti-spam · on/off/status'),row('welcome','Welcome · on/off/status'),row('setwelcometext','Atur teks welcome'),row('setleavetext','Atur teks anggota keluar'),row('blacklist','Blacklist anggota · mention'),row('unblacklist','Hapus blacklist · mention'),row('bancmd','Blokir command grup'),row('unbancmd','Buka blokir command'),row('groupschedule','Jadwal close/open HH:MM')] },
          { title: 'Absensi & Lainnya', rows: [row('absen','Absensi · buka/list/tutup/reset'),row('pinchat','Pin pesan · reply lalu pilih durasi'),row('inviteinfo','Periksa tautan undangan')] }
        ] }]
      });
    }

    const adminCommands = new Set(['tagall','hidetag','revoke','linkgc','setsubject','setdesc','closegroup','opengroup','locked','unlocked','antilink','antispam','welcome','setwelcometext','setleavetext','ephemeral','bancmd','unbancmd','groupschedule','totag','tohidetag','setppgc','pinchat','pinpesan','blacklist','unblacklist']);
    const botAdminCommands = new Set(['revoke','linkgc','setsubject','setdesc','closegroup','opengroup','locked','unlocked','ephemeral','groupschedule','setppgc','pinchat','pinpesan']);
    const group = await groupContext(ctx, adminCommands.has(cmd), botAdminCommands.has(cmd));
    if (!group) return;

    const { metadata, participants } = group;
    const admins = participants.filter(isAdminParticipant);
    const memberJids = participants.map(p => p.id).filter(id => typeof id === 'string' && id.includes('@'));
    const settings = await getGroupSettings(ctx.chat);

    if (cmd === 'getpp' || cmd === 'getppgc') {
      let target = ctx.chat;
      if (cmd === 'getpp') {
        target = String(ctx.mentionedJid?.[0] || ctx.mentions?.[0] || ctx.quoted?.sender || ctx.sender || '');
        if (!/^[^@\s]+@(s\.whatsapp\.net|lid)$/.test(target)) return ctx.reply('Target pengguna tidak valid. Mention anggota, reply pesannya, atau gunakan .getpp untuk foto profil sendiri.');
      }
      if (typeof ctx.sock.profilePictureUrl !== 'function') return ctx.reply('❌ API profilePictureUrl tidak tersedia pada versi Baileys ini.');
      try {
        const url = await ctx.sock.profilePictureUrl(target, 'image');
        if (!url || !/^https:\/\//i.test(url)) return ctx.reply('ℹ️ Foto profil tidak tersedia atau disembunyikan oleh pemiliknya.');
        return ctx.sock.sendMessage(ctx.chat, { image: { url }, caption: cmd === 'getppgc' ? `Foto profil grup: ${metadata.subject || ctx.chat}` : `Foto profil: @${digits(target)}`, ...(cmd === 'getpp' ? { mentions: [target] } : {}) }, { quoted: ctx.raw || ctx });
      } catch (error) {
        return ctx.reply(`❌ Foto profil tidak dapat diakses; mungkin disembunyikan oleh pengaturan privasi. (${String(error?.message || 'API error').slice(0, 80)})`);
      }
    }

    if (cmd === 'blacklist' || cmd === 'unblacklist') {
      if (!group.callerAdmin) return ctx.reply('🔒 Hanya admin grup atau owner bot yang dapat mengubah blacklist.');
      const targets = [...new Set([...(ctx.mentionedJid || ctx.mentions || []), ...(ctx.quoted?.sender ? [ctx.quoted.sender] : [])].map(String))];
      if (!targets.length) return ctx.reply(`Format: .${cmd} @anggota atau reply pesan anggota.`);
      const protectedIds = new Set([ctx.sender, ...admins.map(p => p.id).filter(Boolean)].map(String));
      const eligible = targets.filter(jid => /@(s\.whatsapp\.net|lid)$/.test(jid) && !protectedIds.has(jid) && !isOwner([jid], ctx.config));
      const excluded = targets.filter(jid => !eligible.includes(jid));
      const existing = Array.isArray(settings.blacklist) ? settings.blacklist : [];
      const next = cmd === 'blacklist' ? [...new Set([...existing, ...eligible])].slice(0, 500) : existing.filter(jid => !eligible.includes(jid));
      await updateGroupSettings(ctx.chat, { blacklist: next });
      const action = cmd === 'blacklist' ? 'ditambahkan ke' : 'dihapus dari';
      return ctx.reply(`${cmd === 'blacklist' ? '🚫' : '♻️'} ${eligible.length} anggota ${action} blacklist grup.\n${excluded.length ? `Tidak diproses (admin/owner/pengenal tidak valid): ${excluded.length}.\n` : ''}Blacklist akan menghapus pesan berikutnya dari anggota yang tercantum jika bot memiliki izin menghapus pesan.`);
    }

    if (cmd === 'inviteinfo') {
      const rawLink = String(ctx.args?.[0] || '').trim();
      const match = rawLink.match(/^(?:https?:\/\/)?chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,})\/?$/i);
      if (!match) return ctx.reply('Format: .inviteinfo https://chat.whatsapp.com/KODEUNDANGAN\nTautan harus berupa tautan undangan WhatsApp yang valid.');
      if (typeof ctx.sock.groupGetInviteInfo !== 'function') return ctx.reply('❌ API groupGetInviteInfo tidak tersedia pada versi Baileys ini.');
      try {
        const info = await ctx.sock.groupGetInviteInfo(match[1]);
        if (!info || typeof info !== 'object') return ctx.reply('❌ Informasi undangan tidak tersedia atau tautan sudah tidak berlaku.');
        const created = info.creation ? fmtDate(info.creation) : '-';
        const expiry = info.expiration ? fmtDate(info.expiration) : 'Tidak diketahui';
        return ctx.reply(`🔎 *INFORMASI UNDANGAN GRUP*\nNama: ${String(info.subject || '(tidak tersedia)').slice(0, 120)}\nID: ${String(info.id || '-').slice(0, 120)}\nJumlah anggota: ${Number.isFinite(Number(info.size)) ? Number(info.size) : 'Tidak diketahui'}\nDibuat: ${created}\nKedaluwarsa: ${expiry}\nDeskripsi: ${String(info.desc || '(tidak ada deskripsi)').slice(0, 500)}`);
      } catch (error) {
        return ctx.reply(`❌ Tidak dapat membaca undangan. Pastikan tautan masih aktif. (${String(error?.message || 'API error').slice(0, 100)})`);
      }
    }
    if (cmd === 'setppgc') {
      const quoted = ctx.quoted;
      if (!quoted || typeof quoted.download !== 'function') return ctx.reply('Reply sebuah foto dengan .setppgc. Format yang didukung: JPEG, PNG, atau WebP.');
      const mime = String(quoted.mimetype || '').split(';')[0].trim().toLowerCase();
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) return ctx.reply('❌ Media yang direply harus berupa foto JPEG, PNG, atau WebP.');
      if (typeof ctx.sock.updateProfilePicture !== 'function') return ctx.reply('❌ API updateProfilePicture tidak tersedia pada versi Baileys ini.');
      try {
        const buffer = await quoted.download();
        if (!Buffer.isBuffer(buffer) || buffer.length < 1 || buffer.length > 5 * 1024 * 1024) return ctx.reply('❌ Foto kosong atau melebihi batas 5 MB.');
        await ctx.sock.updateProfilePicture(ctx.chat, buffer);
        return ctx.reply('✅ Foto profil grup berhasil diperbarui.');
      } catch (error) {
        return ctx.reply(`❌ Gagal mengganti foto grup. Pastikan bot memiliki izin admin. (${String(error?.message || 'API error').slice(0, 100)})`);
      }
    }
    if (cmd === 'totag' || cmd === 'tohidetag') {
      const quoted = ctx.quoted;
      if (!quoted?.message || !quoted?.type) return ctx.reply(`Reply pesan teks atau media dengan .${cmd}.`);
      const mentions = memberJids;
      const mentionText = cmd === 'totag' ? `\n\n${memberJids.map(id => `@${digits(id)}`).join(' ')}` : '';
      const type = String(quoted.type).replace(/Message$/, '').toLowerCase();
      const text = String(ctx.args?.join(' ') || quoted.text || '').slice(0, 1000);
      const quotedPayload = quoted.message[quoted.type] || quoted.msg || {};
      const mediaType = ['image', 'video', 'audio', 'document', 'sticker'].includes(type) ? type : null;
      try {
        if (mediaType && typeof quoted.download === 'function') {
          const buffer = await quoted.download();
          if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 15 * 1024 * 1024) return ctx.reply('❌ Media kosong atau melebihi batas 15 MB.');
          const payload = { [mediaType]: buffer };
          if (['image', 'video', 'document'].includes(mediaType) && text) payload.caption = `${text}${mentionText}`.slice(0, 3000);
          if (mediaType === 'audio') payload.mimetype = quoted.mimetype || 'audio/mpeg';
          if (mediaType === 'document') payload.mimetype = quoted.mimetype || 'application/octet-stream';
          if (mediaType === 'sticker') {
            await ctx.sock.sendMessage(ctx.chat, { text: `📣 ${text || 'Pesan diteruskan'}${mentionText}`, mentions }, { quoted: ctx.raw });
            return ctx.sock.sendMessage(ctx.chat, payload, { quoted: ctx.raw });
          }
          return ctx.sock.sendMessage(ctx.chat, { ...payload, ...(mediaType === 'audio' ? { ptt: Boolean(quotedPayload.ptt) } : {}), ...(cmd === 'totag' ? { mentions } : {}) }, { quoted: ctx.raw });
        }
        const body = `${text || '(pesan tanpa teks)'}${mentionText}`;
        return ctx.sock.sendMessage(ctx.chat, { text: body.slice(0, 3500), mentions }, { quoted: ctx.raw });
      } catch (error) {
        return ctx.reply(`❌ Gagal meneruskan pesan. (${String(error?.message || 'media error').slice(0, 100)})`);
      }
    }

    if (cmd === 'absen') {
      const sub = String(ctx.args?.[0] || '').toLowerCase();
      let attendance = settings.attendance && typeof settings.attendance === 'object'
        ? settings.attendance
        : { title: null, openedAt: null, closedAt: null, entries: [] };
      if (['buka', 'open'].includes(sub)) {
        if (!group.callerAdmin) return ctx.reply('🔒 Hanya admin grup atau owner bot yang dapat membuka absensi.');
        attendance = { title: String(ctx.args.slice(1).join(' ') || 'Absensi Grup').slice(0, 100), openedAt: new Date().toISOString(), closedAt: null, entries: [] };
        await updateGroupSettings(ctx.chat, { attendance });
        return ctx.reply(`✅ Absensi dibuka: *${attendance.title}*\nAnggota dapat mengetik .absen untuk mencatat kehadiran.`);
      }
      if (['tutup', 'close'].includes(sub)) {
        if (!group.callerAdmin) return ctx.reply('🔒 Hanya admin grup atau owner bot yang dapat menutup absensi.');
        if (!attendance.openedAt || attendance.closedAt) return ctx.reply('ℹ️ Tidak ada absensi aktif.');
        attendance = { ...attendance, closedAt: new Date().toISOString() };
        await updateGroupSettings(ctx.chat, { attendance });
        return ctx.reply(`🔒 Absensi ditutup. Total hadir: ${attendance.entries?.length || 0}. Gunakan .absen list untuk melihat daftar.`);
      }
      if (['reset', 'hapus'].includes(sub)) {
        if (!group.callerAdmin) return ctx.reply('🔒 Hanya admin grup atau owner bot yang dapat menghapus data absensi.');
        await updateGroupSettings(ctx.chat, { attendance: { title: null, openedAt: null, closedAt: null, entries: [] } });
        return ctx.reply('🧹 Data absensi grup direset.');
      }
      if (['list', 'daftar', 'status'].includes(sub)) {
        const entries = Array.isArray(attendance.entries) ? attendance.entries : [];
        if (!attendance.openedAt) return ctx.reply('ℹ️ Absensi belum dibuka. Admin dapat mengetik .absen buka [judul].');
        const lines = entries.map((e, i) => `${i + 1}. ${e.name} — ${new Date(e.at).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })}`);
        return ctx.reply(`📋 *ABSENSI: ${attendance.title || 'Absensi Grup'}*\nStatus: ${attendance.closedAt ? 'Ditutup' : 'Dibuka'}\nTotal hadir: ${entries.length}\n\n${lines.join('\n') || 'Belum ada anggota yang absen.'}`);
      }
      if (!attendance.openedAt || attendance.closedAt) return ctx.reply('ℹ️ Absensi belum dibuka atau sudah ditutup. Admin dapat mengetik .absen buka [judul].');
      const jid = String(ctx.sender || ctx.raw?.key?.participant || '');
      if (!jid.includes('@') || jid.endsWith('@g.us')) return ctx.reply('❌ Identitas anggota tidak valid; absensi tidak dicatat.');
      const entries = Array.isArray(attendance.entries) ? attendance.entries : [];
      if (entries.some(e => e.jid === jid)) return ctx.reply('✅ Kehadiran kamu sudah tercatat.');
      if (entries.length >= 1000) return ctx.reply('❌ Batas 1.000 catatan absensi tercapai.');
      const displayName = String(ctx.pushName || ctx.senderName || jid.split('@')[0]).slice(0, 100);
      entries.push({ jid, name: displayName, at: new Date().toISOString() });
      await updateGroupSettings(ctx.chat, { attendance: { ...attendance, entries } });
      return ctx.reply(`✅ Kehadiran tercatat untuk *${displayName}*.\nTotal hadir: ${entries.length}`);
    }

    if (cmd === 'pinchat' || cmd === 'pinpesan') {
      const key = ctx.quoted?.key || ctx.quoted?.raw?.key || ctx.quoted?.messageKey;
      if (!key || typeof key !== 'object' || !key.id || !key.remoteJid) return ctx.reply(`Reply pesan yang ingin dipin, lalu ketik .${cmd} 24h, 7d, atau 30d.`);
      const duration = String(ctx.args?.[0] || '').toLowerCase();
      const durationSeconds = ({ '24h': 86400, '1d': 86400, '7d': 604800, '30d': 2592000 })[duration];
      if (!durationSeconds) return ctx.reply('Durasi pin yang didukung: 24h, 7d, atau 30d.');
      try {
        await ctx.sock.sendMessage(ctx.chat, { pin: key, type: 1, time: durationSeconds });
        return ctx.reply(`📌 Permintaan pin pesan dikirim untuk durasi ${duration}. Jika Baileys/WhatsApp menolak operasi ini, periksa versi API dan izin admin bot.`);
      } catch (error) {
        return ctx.reply(`❌ Pin pesan gagal. Pastikan bot admin dan API mendukung fitur ini. (${String(error?.message || 'API error').slice(0, 100)})`);
      }
    }

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
    if (cmd === 'linkgc') {
      if (typeof ctx.sock.groupInviteCode !== 'function') return ctx.reply('❌ API groupInviteCode tidak tersedia pada versi Baileys ini.');
      try { const code = await ctx.sock.groupInviteCode(ctx.chat); return ctx.reply(`🔗 Tautan undangan grup:\nhttps://chat.whatsapp.com/${code}`); }
      catch (error) { return ctx.reply(`❌ Gagal mengambil tautan undangan. (${String(error?.message || 'API error').slice(0, 100)})`); }
    }
    if (cmd === 'revoke') {
      if (typeof ctx.sock.groupRevokeInvite !== 'function') return ctx.reply('❌ API groupRevokeInvite tidak tersedia pada versi Baileys ini.');
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
    if (['closegroup', 'opengroup', 'locked', 'unlocked'].includes(cmd)) {
      if (typeof ctx.sock.groupSettingUpdate !== 'function') return ctx.reply('❌ API groupSettingUpdate tidak tersedia pada versi Baileys ini.');
      const setting = ({ closegroup: 'announcement', opengroup: 'not_announcement', locked: 'locked', unlocked: 'unlocked' })[cmd];
      try {
        await ctx.sock.groupSettingUpdate(ctx.chat, setting);
        const messages = { closegroup: '🔒 Grup ditutup: hanya admin yang dapat mengirim pesan.', opengroup: '🔓 Grup dibuka: semua anggota dapat mengirim pesan.', locked: '🔐 Pengaturan grup dikunci: hanya admin yang dapat mengubah info grup.', unlocked: '🔓 Pengaturan grup dibuka: anggota dapat mengubah info grup.' };
        return ctx.reply(messages[cmd]);
      } catch (error) { return ctx.reply(`❌ Gagal mengubah pengaturan grup. (${String(error?.message || 'API error').slice(0, 100)})`); }
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
    if (cmd === 'ephemeral') {
      const choice = String(ctx.args?.[0] || 'status').toLowerCase();
      const secondsByChoice = { off: 0, '24h': 86400, '7d': 604800, '90d': 7776000 };
      if (choice === 'status') {
        const seconds = Number(metadata.ephemeralDuration || 0);
        const label = seconds === 86400 ? '24 jam' : seconds === 604800 ? '7 hari' : seconds === 7776000 ? '90 hari' : seconds ? `${seconds} detik` : 'nonaktif';
        return ctx.reply(`⏳ Pesan sementara grup: ${label}\nFormat: .ephemeral off|24h|7d|90d`);
      }
      if (!(choice in secondsByChoice)) return ctx.reply('Format: .ephemeral off|24h|7d|90d');
      if (typeof ctx.sock.groupToggleEphemeral !== 'function') return ctx.reply('❌ Versi Baileys/socket ini tidak menyediakan groupToggleEphemeral. Tidak ada perubahan yang dilakukan.');
      await ctx.sock.groupToggleEphemeral(ctx.chat, secondsByChoice[choice]);
      return ctx.reply(`✅ Pesan sementara grup ${secondsByChoice[choice] ? `diaktifkan (${choice})` : 'dinonaktifkan'}.`);
    }
    if (cmd === 'bancmd' || cmd === 'unbancmd') {
      const raw = (ctx.args || []).join(' ').trim();
      if (!raw || raw === '--list' || raw === 'list') {
        return ctx.reply(`🚫 *COMMAND DIBLOKIR DI GRUP INI*\n${settings.cmdblocked?.length ? settings.cmdblocked.map((name, i) => `${i + 1}. .${name}`).join('\n') : 'Belum ada command yang diblokir.'}\n\nFormat: .bancmd <command> · .unbancmd <command>`);
      }
      const names = raw.split(/[\s,]+/).map(v => v.replace(/^[.!#/]+/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '')).filter(v => v && v.length <= 40 && !['bancmd','unbancmd','grouphelp','groupstatus','groupinfo','menu','help','ping','owner'].includes(v));
      if (!names.length) return ctx.reply('❌ Nama command tidak valid atau termasuk command yang dilindungi.');
      const current = new Set(settings.cmdblocked || []);
      for (const name of names) cmd === 'bancmd' ? current.add(name) : current.delete(name);
      const saved = await updateGroupSettings(ctx.chat, { cmdblocked: [...current] });
      return ctx.reply(`✅ ${cmd === 'bancmd' ? 'Diblokir' : 'Dibuka blokirnya'}: ${names.map(v => `.${v}`).join(', ')}\nTotal command diblokir: ${saved.cmdblocked.length}`);
    }
    if (cmd === 'setwelcometext' || cmd === 'setleavetext') {
      const text = String(ctx.args?.join(' ') || '').trim();
      if (!text) return ctx.reply(`Format: .${cmd} ${cmd === 'setwelcometext' ? 'Selamat datang {user} di {group}!' : '{user} telah meninggalkan {group}.'}`);
      await updateGroupSettings(ctx.chat, { [cmd === 'setwelcometext' ? 'welcomeText' : 'leaveText']: text });
      return ctx.reply(`✅ Teks ${cmd === 'setwelcometext' ? 'welcome' : 'leave'} disimpan. Placeholder: {user}, {group}.`);
    }
    if (cmd === 'groupschedule') {
      const [actionRaw, timeRaw] = ctx.args || [];
      const action = String(actionRaw || 'list').toLowerCase();
      if (action === 'off' || action === 'hapus' || action === 'disable') {
        await updateGroupSettings(ctx.chat, { schedule: { closeAt: null, openAt: null, lastCloseDate: null, lastOpenDate: null } });
        return ctx.reply('✅ Jadwal buka/tutup otomatis grup dinonaktifkan.');
      }
      if (action === 'list' || action === 'status') {
        const sch = settings.schedule || {};
        return ctx.reply(`🗓️ *JADWAL GRUP (WIB)*\nTutup otomatis: ${sch.closeAt || 'belum disetel'}\nBuka otomatis: ${sch.openAt || 'belum disetel'}\n\nFormat: .groupschedule close|open HH:MM\nContoh: .groupschedule close 22:00\nNonaktifkan: .groupschedule off`);
      }
      if (!['close','open','tutup','buka'].includes(action) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(timeRaw || ''))) return ctx.reply('Format: .groupschedule close HH:MM atau .groupschedule open HH:MM (zona waktu WIB).');
      const key = ['close','tutup'].includes(action) ? 'closeAt' : 'openAt';
      const schedule = { ...(settings.schedule || { closeAt: null, openAt: null, lastCloseDate: null, lastOpenDate: null }), [key]: timeRaw, lastCloseDate: null, lastOpenDate: null };
      await updateGroupSettings(ctx.chat, { schedule });
      return ctx.reply(`✅ Jadwal ${key === 'closeAt' ? 'tutup' : 'buka'} grup disetel pukul ${timeRaw} WIB. Bot harus online pada waktu tersebut dan memiliki izin admin.`);
    }
  }
};

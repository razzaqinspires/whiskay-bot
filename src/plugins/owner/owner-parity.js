import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { groupMetadataStore } from '../../services/groupMetadataStore.js';

const PAGE_SIZE = 15;
const MAX_TEXT = 7000;
const SECRET_ENV_KEYS = [
  'OPENAI_API_KEY', 'OPENAI_API_KEYS', 'GROQ_API_KEY', 'GROQ_API_KEYS',
  'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GEMINI_API_KEY',
  'DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY',
  'GITHUB_TOKEN', 'WHISKAY_GITHUB_TOKEN', 'WHISKAY_GITHUB_TRAFFIC_TOKEN',
  'BOT_SYNC_TOKEN', 'DUNGEON_SYNC_TOKEN', 'WHISKAY_BOSS_WEBHOOK_SECRET'
];

function isGroupJid(value) {
  return /^(?:\d{5,30}-\d{5,30}|\d{10,30})@g\.us$/.test(String(value || '').trim());
}

function parseInvite(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const urlMatch = raw.match(/(?:https?:\/\/)?chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,})/i);
  const code = urlMatch?.[1] || raw;
  return /^[A-Za-z0-9_-]{10,80}$/.test(code) ? code : '';
}

function normalizeUsers(raw) {
  const users = Array.isArray(raw) ? raw : Array.isArray(raw?.users) ? raw.users : [];
  const seen = new Set();
  const result = [];
  for (const item of users) {
    const jid = String(typeof item === 'string' ? item : item?.jid || item?.id || '').trim();
    if (!/^(?:\d{5,20}@s\.whatsapp\.net|[\w.-]{1,80}@lid)$/.test(jid) || seen.has(jid)) continue;
    seen.add(jid);
    result.push({ jid, name: String(typeof item === 'object' ? item?.name || item?.pushName || '' : '').trim() });
  }
  return result.sort((a, b) => (a.name || a.jid).localeCompare(b.name || b.jid));
}

function safePage(value, totalPages) {
  const n = Number(value || 1);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(totalPages, Math.floor(n)));
}

function renderPage(title, rows, page, totalPages, prefix, command) {
  const start = (page - 1) * PAGE_SIZE;
  const body = rows.slice(start, start + PAGE_SIZE).join('\n') || 'Tidak ada data pada halaman ini.';
  const buttons = [];
  if (page > 1) buttons.push({ name: 'quick_reply', title: '⬅️ Sebelumnya', id: `${prefix}${command} ${page - 1}` });
  if (page < totalPages) buttons.push({ name: 'quick_reply', title: 'Berikutnya ➡️', id: `${prefix}${command} ${page + 1}` });
  buttons.push({ name: 'quick_reply', title: '🔄 Refresh daftar', id: `${prefix}${command}` });
  return { title, subtitle: `Halaman ${page}/${totalPages}`, body: `${body}\n\nTotal entri: ${rows.length}`, buttons };
}

function safeGroupName(value) { return String(value || '(nama tidak tersedia)').replace(/[\r\n\u0000]/g, ' ').slice(0, 100); }
function ownerJidOf(meta) {
  const raw = meta?.owner || meta?.ownerJid || meta?.subjectOwner || '';
  if (typeof raw === 'string') return raw;
  return String(raw?.id || raw?.jid || raw?.phoneNumber || '');
}
function participantLabel(row, index) {
  const name = String(row?.name || row?.notify || row?.pushName || '').replace(/[\r\n]/g, ' ').slice(0, 60);
  const jid = String(row?.id || row?.jid || row?.phoneNumber || row?.lid || 'unknown');
  const role = row?.admin === 'superadmin' ? '👑 Owner grup' : row?.admin ? '🛡️ Admin' : '👤 Anggota';
  return `${index + 1}. ${role} · ${name ? `${name} · ` : ''}${jid}`;
}
function buildGroupList(ctx, entries, page) {
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const current = safePage(page, totalPages);
  const slice = entries.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const rows = slice.map((group, index) => ({
    title: safeGroupName(group.subject).slice(0, 24) || `Grup ${index + 1}`,
    description: `${group.count} anggota · ${group.jid}`.slice(0, 72),
    id: `${ctx.prefix}listgc detail ${group.jid}`
  }));
  const buttons = [];
  if (rows.length) buttons.push({ name: 'single_select', title: 'Pilih grup untuk detail', sections: [{ title: `Grup ${current}/${totalPages}`, rows }] });
  if (current > 1) buttons.push({ name: 'quick_reply', title: '⬅️ Sebelumnya', id: `${ctx.prefix}listgc ${current - 1}` });
  if (current < totalPages) buttons.push({ name: 'quick_reply', title: 'Berikutnya ➡️', id: `${ctx.prefix}listgc ${current + 1}` });
  return {
    title: '📋 WHISKAY · DAFTAR GRUP',
    subtitle: `${entries.length} grup tersimpan · cache lokal`,
    body: `Pilih nama grup melalui daftar untuk membuka metadata lengkap.\nData dibaca dari data/group-metadata.json dan diperbarui oleh event socket; perintah ini tidak melakukan fetch metadata baru.`,
    buttons
  };
}
async function loadRegisteredUsers() {
  const file = path.resolve('data/registered-users.json');
  try {
    return normalizeUsers(JSON.parse(await readFile(file, 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw new Error(`Gagal membaca data/registered-users.json: ${error.message}`);
  }
}

export const ownerParityInternals = { isGroupJid, parseInvite, normalizeUsers, safePage };

export default {
  name: 'owner-parity',
  command: ['listgc', 'listgroup', 'joingc', 'join', 'masuk', 'leave', 'keluar', 'listuser', 'cekapikey', 'copymember', 'copyptpt', 'groupinvite'],
  category: 'owner',
  owner: true,
  energyMode: 'free',
  energyCost: 0,
  cooldown: 2500,
  description: 'Owner parity: daftar grup/user, join/leave terkontrol, dan cek konfigurasi API key tanpa membocorkan secret',
  async execute(ctx) {
    if (!ctx.isOwner) return ctx.reply('🔒 Perintah ini khusus owner bot.');
    const command = String(ctx.command || '').toLowerCase();
    const args = Array.isArray(ctx.args) ? ctx.args.map(String) : [];
    const sock = ctx.sock;
    const prefix = String(ctx.prefix || '.');

    if (['listgc', 'listgroup'].includes(command)) {
      const action = String(args[0] || '').toLowerCase();
      const groups = groupMetadataStore.all();
      if (action === 'detail') {
        const jid = String(args[1] || '').trim();
        if (!isGroupJid(jid)) return ctx.reply(`Format: ${prefix}listgc detail <GROUP_ID>`);
        const meta = groupMetadataStore.get(jid);
        if (!meta) return ctx.reply('Metadata grup belum tersedia di cache. Cache hanya diisi dari snapshot awal dan event grup; periksa apakah bot masih menjadi anggota grup.');
        const participants = Array.isArray(meta.participants) ? meta.participants : [];
        const owner = ownerJidOf(meta);
        const admins = participants.filter(row => row?.admin);
        const memberPreview = participants.slice(0, 18).map(participantLabel).join('\n') || 'Daftar anggota belum tersedia.';
        const created = meta.creation ? new Date(Number(meta.creation) * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : 'tidak tersedia';
        const text = [
          `📋 *DETAIL GRUP WHISKAY*`,
          `Nama: *${safeGroupName(meta.subject)}*`,
          `ID: ${jid}`,
          `Owner: ${owner ? `@${owner.split('@')[0].split(':')[0]}` : 'tidak tersedia'}`,
          `Total anggota: ${participants.length}`,
          `Admin terdeteksi: ${admins.length}`,
          `Dibuat: ${created}`,
          `Mode: ${meta.announce ? 'hanya admin dapat mengirim' : 'semua anggota dapat mengirim'} · ${meta.restrict ? 'info grup dibatasi admin' : 'info grup terbuka'}`,
          `Deskripsi: ${meta.desc || '(kosong/tidak tersedia)'}`,
          '', '*Cuplikan peserta*', memberPreview,
          '', `Anggota lengkap: ${prefix}listgc members ${jid} 1`,
          'Data berasal dari cache lokal; tidak ada fetch metadata pada saat detail dibuka.'
        ].join('\n').slice(0, MAX_TEXT);
        return sock.sendMessage(ctx.chat, { text, ...(owner ? { mentions: [owner] } : {}) }, ctx.quoted ? { quoted: ctx.quoted } : {});
      }
      if (action === 'members') {
        const jid = String(args[1] || '').trim();
        if (!isGroupJid(jid)) return ctx.reply(`Format: ${prefix}listgc members <GROUP_ID> [halaman]`);
        const meta = groupMetadataStore.get(jid);
        if (!meta) return ctx.reply('Metadata grup tidak ditemukan di cache.');
        const participants = Array.isArray(meta.participants) ? meta.participants : [];
        if (!participants.length) return ctx.reply('Daftar peserta belum tersimpan di cache grup ini.');
        const pageSize = 30;
        const totalPages = Math.max(1, Math.ceil(participants.length / pageSize));
        const page = safePage(args[2], totalPages);
        const lines = participants.slice((page - 1) * pageSize, page * pageSize).map((row, i) => participantLabel(row, (page - 1) * pageSize + i));
        const buttons = [];
        if (page > 1) buttons.push({ name: 'quick_reply', title: '⬅️ Sebelumnya', id: `${prefix}listgc members ${jid} ${page - 1}` });
        if (page < totalPages) buttons.push({ name: 'quick_reply', title: 'Berikutnya ➡️', id: `${prefix}listgc members ${jid} ${page + 1}` });
        buttons.push({ name: 'quick_reply', title: '↩️ Detail grup', id: `${prefix}listgc detail ${jid}` });
        return ctx.sendInteractive({ title: `👥 ANGGOTA · ${safeGroupName(meta.subject).slice(0, 40)}`, subtitle: `${participants.length} anggota · halaman ${page}/${totalPages}`, body: lines.join('\n'), buttons });
      }
      if (!groups.length) return ctx.reply('Cache metadata grup masih kosong. Snapshot awal akan dibuat sekali ketika bot tersambung; pastikan bot sudah online dan menjadi anggota grup.');
      const entries = groups.map(meta => ({ jid: meta.id, subject: String(meta.subject || '(nama tidak tersedia)'), count: Array.isArray(meta.participants) ? meta.participants.length : Number(meta.size || 0) }));
      return ctx.sendInteractive(buildGroupList(ctx, entries, action === 'list' ? args[1] : args[0]));
    }

    if (['joingc', 'join', 'masuk'].includes(command)) {
      const invite = parseInvite(args.join(' '));
      if (!invite) return ctx.reply(`Format: ${prefix}joingc <tautan undangan WhatsApp> (khusus owner)\nContoh: ${prefix}joingc https://chat.whatsapp.com/KODEUNDANGAN123`);
      if (typeof sock?.groupAcceptInvite !== 'function') return ctx.reply('❌ Baileys tidak menyediakan groupAcceptInvite pada socket ini.');
      try {
        const groupJid = await sock.groupAcceptInvite(invite);
        if (groupJid && typeof sock.groupMetadata === 'function') {
          try { groupMetadataStore.upsert(await sock.groupMetadata(groupJid), groupJid); await groupMetadataStore.flush(); } catch {}
        }
        const meta = groupJid ? groupMetadataStore.get(groupJid) : null;
        return ctx.reply(`✅ Bot berhasil bergabung${meta?.subject ? ` ke *${safeGroupName(meta.subject)}*` : ''}.\nID grup: ${String(groupJid || '(tidak dikembalikan)')}\nAnggota tercatat: ${meta?.participants?.length ?? 'menunggu event cache'}\nPeriksa daftar dengan ${prefix}listgc.`);
      } catch (error) {
        const message = String(error?.message || error).slice(0, 300);
        return ctx.reply(`❌ Bot gagal bergabung. Tautan mungkin tidak valid/kedaluwarsa atau akun tidak diizinkan.\nDetail: ${message}`);
      }
    }

    if (['copymember', 'copyptpt'].includes(command)) {
      const sourceJid = String(args[0] || '').trim();
      if (!isGroupJid(sourceJid)) return ctx.reply(`Format: ${prefix}${command} <GROUP_ID>\nGunakan ID grup dari ${prefix}listgc.`);
      const meta = groupMetadataStore.get(sourceJid);
      if (!meta) return ctx.reply('Metadata sumber tidak ditemukan di cache. Jalankan .listgc setelah bot menyelesaikan snapshot grup.');
      const participants = Array.isArray(meta.participants) ? meta.participants : [];
      const admins = participants.filter(row => row?.admin).length;
      return ctx.sendInteractive({
        title: '🔎 PRATINJAU GRUP SUMBER',
        subtitle: safeGroupName(meta.subject),
        body: `ID sumber: ${sourceJid}\nAnggota tercatat: ${participants.length}\nAdmin: ${admins}\n\nPrivasi anggota dijaga: bot tidak menyalin daftar kontak, tidak menambahkan peserta massal, dan tidak mengirim undangan tanpa persetujuan masing-masing.\n\nUntuk mengundang anggota yang memang meminta bergabung, buat tautan undangan grup tujuan secara privat menggunakan .groupinvite <GROUP_ID_TUJUAN>. Bagikan tautan itu hanya kepada orang yang menyetujuinya.`,
        buttons: [{ name: 'quick_reply', title: '📋 Buka detail sumber', id: `${prefix}listgc detail ${sourceJid}` }, { name: 'quick_reply', title: '🔗 Panduan undangan', id: `${prefix}groupinvite` }]
      });
    }

    if (command === 'groupinvite') {
      if (ctx.isGroup) return ctx.reply('🔒 Demi mencegah tautan undangan tersebar ke seluruh grup, jalankan perintah ini melalui chat pribadi bot.');
      const targetJid = String(args[0] || '').trim();
      if (!isGroupJid(targetJid)) return ctx.reply(`Format: ${prefix}groupinvite <GROUP_ID_TUJUAN>\nLihat ID melalui ${prefix}listgc.`);
      const meta = groupMetadataStore.get(targetJid);
      if (!meta) return ctx.reply('Grup tujuan tidak ditemukan di cache. Pastikan bot masih menjadi anggota grup tersebut.');
      if (typeof sock?.groupInviteCode !== 'function') return ctx.reply('Socket Baileys tidak mendukung groupInviteCode.');
      try {
        const code = await sock.groupInviteCode(targetJid);
        if (!code || !/^[A-Za-z0-9_-]{10,100}$/.test(String(code))) return ctx.reply('WhatsApp tidak mengembalikan kode undangan yang valid.');
        const link = `https://chat.whatsapp.com/${code}`;
        return ctx.reply(`🔗 *TAUTAN UNDANGAN GRUP*\nNama: ${safeGroupName(meta.subject)}\nID: ${targetJid}\nAnggota saat ini: ${meta.participants?.length ?? meta.size ?? 0}\n\n${link}\n\nBagikan hanya kepada orang yang secara sukarela meminta bergabung. Bot tidak menambahkan atau menyalin anggota secara otomatis.`);
      } catch (error) {
        return ctx.reply(`❌ Gagal membuat tautan undangan: ${String(error?.message || error).slice(0, 220)}`);
      }
    }

    if (['leave', 'keluar'].includes(command)) {
      const target = String(args[0] || '').trim();
      if (target.toLowerCase() !== 'confirm') {
        return ctx.reply(`⚠️ Keluar grup membutuhkan konfirmasi eksplisit.\nUntuk keluar dari grup tempat perintah dikirim: ${prefix}leave confirm\nPerintah ini tidak dapat digunakan di chat pribadi tanpa target yang sah.`);
      }
      if (!ctx.isGroup || !isGroupJid(ctx.chat)) return ctx.reply('❌ Jalankan perintah konfirmasi ini di dalam grup yang ingin ditinggalkan.');
      if (typeof sock?.groupLeave !== 'function') return ctx.reply('❌ Baileys tidak menyediakan groupLeave pada socket ini.');
      try {
        // Send intent while the bot is still a member; replying after groupLeave may fail.
        await ctx.reply(`🚪 Konfirmasi diterima. Bot akan keluar dari grup ini (${ctx.chat}).`);
        await sock.groupLeave(ctx.chat);
        groupMetadataStore.remove(ctx.chat);
        await groupMetadataStore.flush();
        // A private confirmation is best-effort; group departure already succeeded.
        if (ctx.sender && typeof sock.sendMessage === 'function') {
          await sock.sendMessage(ctx.sender, { text: `✅ Bot telah keluar dari grup ${ctx.chat}.` }).catch(() => {});
        }
        return;
      } catch (error) {
        return ctx.reply(`❌ Gagal keluar dari grup: ${String(error?.message || error).slice(0, 240)}`);
      }
    }

    if (command === 'listuser') {
      let users;
      try { users = await loadRegisteredUsers(); }
      catch (error) { return ctx.reply(`❌ ${error.message}`); }
      if (!users.length) return ctx.reply('Belum ada pengguna pada data/registered-users.json. Perintah ini hanya membaca daftar pendaftaran lokal; tidak memindai kontak WhatsApp.');
      const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
      const page = safePage(args[0], totalPages);
      const rows = users.map((user, i) => `${i + 1}. ${user.name ? `*${user.name.replace(/[\r\n]/g, ' ').slice(0, 80)}* · ` : ''}${user.jid}`);
      return ctx.sendInteractive(renderPage('👥 DAFTAR PENGGUNA TERDAFTAR', rows, page, totalPages, prefix, 'listuser'));
    }

    if (command === 'cekapikey') {
      const rows = SECRET_ENV_KEYS.map(name => {
        const value = String(process.env[name] || '').trim();
        const configured = Boolean(value && !/^replace-with-|^(your|change[-_ ]me|placeholder)/i.test(value));
        const looksLikeList = name.endsWith('_KEYS');
        const usable = configured && (!looksLikeList || (() => { try { const parsed = JSON.parse(value); return Array.isArray(parsed) && parsed.some(x => String(x || '').trim()); } catch { return Boolean(value); } })());
        return `${usable ? '✅' : '⚪'} ${name}: ${usable ? 'terkonfigurasi' : 'kosong/placeholder'}`;
      });
      const configured = rows.filter(row => row.startsWith('✅')).length;
      return ctx.sendInteractive({
        title: '🔐 API KEY CONFIGURATION AUDIT',
        subtitle: `${configured}/${rows.length} variabel terdeteksi terkonfigurasi`,
        body: `${rows.join('\n')}\n\n⚠️ Audit ini hanya mengecek apakah nilai tersedia, bukan menguji validitas API ke provider. Nilai rahasia sengaja tidak ditampilkan, disamarkan, atau dikirim ke log.`,
        buttons: [{ name: 'quick_reply', title: '🔄 Periksa Lagi', id: `${prefix}cekapikey` }, { name: 'quick_reply', title: 'Ops Center', id: `${prefix}opsstatus` }]
      });
    }

    return ctx.reply(`Owner parity commands:\n• ${prefix}listgc [halaman]\n• ${prefix}listgc detail <GROUP_ID>\n• ${prefix}listgc members <GROUP_ID> [halaman]\n• ${prefix}joingc <tautan-undangan> (owner)\n• ${prefix}copymember <GROUP_ID> (pratinjau privat/consent)\n• ${prefix}groupinvite <GROUP_ID_TUJUAN> (tautan undangan, chat pribadi)\n• ${prefix}leave confirm (dari grup target)\n• ${prefix}listuser [halaman]\n• ${prefix}cekapikey (status tanpa menampilkan secret)`);
  }
};

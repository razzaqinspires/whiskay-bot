import { readFile } from 'node:fs/promises';
import path from 'node:path';

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
  buttons.push({ name: 'quick_reply', title: '🔄 Refresh', id: `${prefix}${command} ${page}` });
  return { title, subtitle: `Halaman ${page}/${totalPages}`, body: `${body}\n\nTotal entri: ${rows.length}`, buttons };
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
  command: ['listgc', 'listgroup', 'join', 'masuk', 'leave', 'keluar', 'listuser', 'cekapikey'],
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
      if (typeof sock?.groupFetchAllParticipating !== 'function') {
        return ctx.reply('❌ Versi/socket Baileys ini tidak menyediakan groupFetchAllParticipating.');
      }
      let groups;
      try { groups = await sock.groupFetchAllParticipating(); }
      catch (error) { return ctx.reply(`❌ Gagal mengambil daftar grup: ${String(error?.message || error).slice(0, 240)}`); }
      const entries = Object.entries(groups || {}).filter(([jid]) => jid.endsWith('@g.us'))
        .map(([jid, info]) => ({ jid, subject: String(info?.subject || '(nama tidak tersedia)'), count: Array.isArray(info?.participants) ? info.participants.length : null }))
        .sort((a, b) => a.subject.localeCompare(b.subject));
      if (!entries.length) return ctx.reply('Bot belum terdeteksi bergabung ke grup mana pun.');
      const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
      const page = safePage(args[0], totalPages);
      const rows = entries.map((g, i) => `${i + 1}. *${g.subject.replace(/[\r\n]/g, ' ').slice(0, 100)}*\n   ID: ${g.jid}\n   Anggota: ${g.count ?? 'tidak tersedia'}`);
      const payload = renderPage('📋 DAFTAR GRUP WHISKAY', rows, page, totalPages, prefix, 'listgc');
      payload.body = `${payload.body}\n\nGunakan .join <tautan-undangan> untuk bergabung. Keluar grup memerlukan konfirmasi eksplisit.`.slice(0, MAX_TEXT);
      return ctx.sendInteractive(payload);
    }

    if (['join', 'masuk'].includes(command)) {
      const invite = parseInvite(args.join(' '));
      if (!invite) return ctx.reply(`Format: ${prefix}join <tautan undangan WhatsApp>\nContoh: ${prefix}join https://chat.whatsapp.com/KODEUNDANGAN123`);
      if (typeof sock?.groupAcceptInvite !== 'function') return ctx.reply('❌ Baileys tidak menyediakan groupAcceptInvite pada socket ini.');
      try {
        const groupJid = await sock.groupAcceptInvite(invite);
        return ctx.reply(`✅ Permintaan bergabung berhasil dikirim.\nID grup: ${String(groupJid || '(tidak dikembalikan)')}\nPeriksa daftar grup dengan ${prefix}listgc.`);
      } catch (error) {
        const message = String(error?.message || error).slice(0, 300);
        return ctx.reply(`❌ Bot gagal bergabung. Tautan mungkin tidak valid/kedaluwarsa atau akun tidak diizinkan.\nDetail: ${message}`);
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

    return ctx.reply(`Owner parity commands:\n• ${prefix}listgc [halaman]\n• ${prefix}join <tautan-undangan>\n• ${prefix}leave confirm (dari grup target)\n• ${prefix}listuser [halaman]\n• ${prefix}cekapikey (status tanpa menampilkan secret)`);
  }
};

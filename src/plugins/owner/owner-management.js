import config from '../../config/index.js';
import { isOwner as isConfiguredOwner, sameUser } from '../../lib/security.js';
import {
  deleteUserOwnerMetadata,
  getUser,
  getUserStats,
  isUserBanActive,
  banUser,
  unbanUser,
  updateUser,
  readAppDatabase
} from '../../lib/app-database.js';
import { adjustEnergy, listEnergyUsers } from '../../lib/energy-worker.js';

const PAGE_SIZE = 15;
const MAX_BAN_MS = 365 * 24 * 60 * 60 * 1000;
const FIELD_MAP = Object.freeze({ nickname: 'ownerNickname', note: 'ownerNote' });

function clean(value, max = 240) {
  return String(value || '').replace(/[\r\n\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function parseJid(value) {
  const raw = String(value || '').trim().replace(/[<>]/g, '');
  const bare = raw.startsWith('@') ? raw.slice(1) : raw;
  if (/^\d{8,15}$/.test(bare)) return `${bare}@s.whatsapp.net`;
  if (/^\d{8,20}@s\.whatsapp\.net$/i.test(bare)) return bare;
  if (/^[\w.-]{1,80}@lid$/i.test(bare)) return bare;
  return '';
}

function resolveTarget(ctx, sourceArgs) {
  const args = (Array.isArray(sourceArgs) ? sourceArgs : []).map(String);
  const mentioned = ctx.mentions?.[0] || ctx.mentionedJid?.[0] || ctx.mentionedJids?.[0] || '';
  const quoted = ctx.quoted?.sender || ctx.quoted?.key?.participant || '';
  let target = parseJid(mentioned || quoted);
  let removeIndex = -1;
  if (mentioned) {
    const mentionDigits = String(mentioned).split('@')[0].replace(/[^0-9]/g, '');
    removeIndex = args.findIndex(token => {
      const parsed = parseJid(token);
      return (parsed && parsed === target) || (mentionDigits && token.replace(/^@/, '').replace(/[^0-9]/g, '') === mentionDigits);
    });
  } else if (!quoted) {
    removeIndex = args.findIndex(token => Boolean(parseJid(token)));
    if (removeIndex >= 0) target = parseJid(args[removeIndex]);
  }
  const rest = args.filter((_, index) => index !== removeIndex);
  return { target, args: rest };
}

function parseDuration(value, now = Date.now()) {
  const raw = String(value || '').trim().toLowerCase();
  if (['permanent', 'permanen', 'perma', 'selamanya'].includes(raw)) return { until: 0, label: 'permanen' };
  const match = raw.match(/^(\d{1,4})(s|m|h|d|w)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[match[2]];
  const duration = amount * multiplier;
  if (!Number.isSafeInteger(duration) || duration < 60_000 || duration > MAX_BAN_MS) return null;
  const labels = { s: 'detik', m: 'menit', h: 'jam', d: 'hari', w: 'minggu' };
  return { until: now + duration, label: `${amount} ${labels[match[2]]}`, durationMs: duration };
}

function formatDate(value) {
  const timestamp = Number(value || 0);
  return timestamp > 0 && Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('id-ID', { hour12: false }) : '—';
}

function safeUserSummary(user) {
  if (!user) return 'Pengguna tidak ditemukan.';
  const banStatus = user.banned ? (isUserBanActive(user) ? (Number(user.banUntil || 0) ? `aktif sampai ${formatDate(user.banUntil)}` : 'aktif permanen') : 'kedaluwarsa; akan dibersihkan saat pengguna menjalankan command') : 'tidak diblokir';
  return [
    '👤 *RINGKASAN PENGGUNA WHISKAY*',
    `ID: ${clean(user.id, 180)}`,
    `Nama: ${clean(user.ownerNickname || user.pushName || 'Pengguna', 80)}`,
    `Terdaftar: ${user.registered === true ? 'ya' : 'belum'}`,
    `Dibuat: ${formatDate(user.createdAt)}`,
    `Saldo: ${Math.max(0, Number(user.balance) || 0)}`,
    `Peringatan: ${Math.max(0, Number(user.warnings) || 0)}`,
    `Jumlah pesan: ${Math.max(0, Number(user.messageCount) || 0)}`,
    `Status ban: ${banStatus}`,
    ...(user.banReason ? [`Alasan ban: ${clean(user.banReason, 240)}`] : []),
    ...(user.ownerNote ? [`Catatan owner: ${clean(user.ownerNote, 240)}`] : [])
  ].join('\n');
}

function page(value, total) {
  const parsed = Math.floor(Number(value || 1));
  return Number.isFinite(parsed) ? Math.max(1, Math.min(Math.max(1, total), parsed)) : 1;
}

function paginate(title, rows, pageNumber, prefix, command) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = page(pageNumber, totalPages);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const buttons = [];
  if (current > 1) buttons.push({ name: 'quick_reply', title: '⬅️ Sebelumnya', id: `${prefix}${command} ${current - 1}` });
  if (current < totalPages) buttons.push({ name: 'quick_reply', title: 'Berikutnya ➡️', id: `${prefix}${command} ${current + 1}` });
  buttons.push({ name: 'quick_reply', title: '🔄 Refresh', id: `${prefix}${command} ${current}` });
  return { title, subtitle: `Halaman ${current}/${totalPages}`, body: `${visible.join('\n') || 'Tidak ada data.'}\n\nTotal: ${rows.length}`, buttons };
}

function actorLabel(ctx) {
  return String(ctx.sender || ctx.participant || 'owner').slice(0, 120);
}

function requireTargetSafety(ctx, target, { preventOwner = false, preventSelf = false } = {}) {
  if (!target) return 'Sertakan target dengan mention, reply pesan target, JID, atau nomor telepon valid.';
  if (preventSelf && sameUser(target, ctx.sender)) return 'Aksi ini tidak dapat diterapkan pada akun owner sendiri.';
  if (preventOwner && isConfiguredOwner([target], config)) return 'Aksi ditolak: akun owner lain tidak boleh diblokir lewat command ini.';
  // A LID cannot be safely equated to a phone-number owner unless the configured owner LID matches exactly.
  // Refuse the ban if the identity cannot be verified, rather than risk banning a primary owner alias.
  if (preventOwner && /@lid$/i.test(target)) return 'Target memakai identitas LID yang tidak dapat diverifikasi sebagai nomor pemilik. Untuk keamanan, gunakan PN/JID nomor telepon yang sudah terverifikasi.';
  return '';
}

export const ownerManagementInternals = {
  parseJid,
  resolveTarget,
  parseDuration,
  safeUserSummary,
  page,
  requireTargetSafety,
  FIELD_MAP
};

export default {
  name: 'owner-management',
  command: [
    'banned', 'banuser', 'unbanned', 'unbanuser',
    'addenergy', 'kurangenergy', 'getdata', 'setdata', 'deldata',
    'listbans', 'listenergy'
  ],
  category: 'owner',
  owner: true,
  energyMode: 'free',
  energyCost: 0,
  cooldown: 1500,
  description: 'Manajemen owner terkontrol: ban berdurasi, energi dengan audit, metadata pengguna terbatas, dan daftar moderasi',
  async execute(ctx) {
    if (!ctx.isOwner) return ctx.reply('🔒 Perintah ini khusus owner bot.');
    const command = String(ctx.command || '').toLowerCase();
    const rawArgs = Array.isArray(ctx.args) ? ctx.args.map(String) : [];
    const prefix = String(ctx.prefix || '.');
    const actor = actorLabel(ctx);

    if (['banned', 'banuser'].includes(command)) {
      const { target, args } = resolveTarget(ctx, rawArgs);
      const invalid = requireTargetSafety(ctx, target, { preventSelf: true, preventOwner: true });
      if (invalid) return ctx.reply(`❌ ${invalid}\nFormat: ${prefix}banned @target <durasi|permanent> [alasan]`);
      const duration = parseDuration(args[0]);
      if (!duration) return ctx.reply(`Format durasi tidak valid. Contoh: 30m, 2h, 3d, 1w, permanent. Maksimal 365 hari.\nFormat: ${prefix}banned @target <durasi|permanent> [alasan]`);
      const user = await getUser(target).catch(() => null);
      if (!user) return ctx.reply('❌ Target belum ada di database pengguna Whiskay. Minta target mengirim pesan terlebih dahulu lalu coba lagi.');
      const reason = clean(args.slice(1).join(' '), 240) || 'Tidak dicantumkan';
      try {
        await banUser(target, { until: duration.until, reason, by: actor });
        return ctx.sendInteractive({
          title: '⛔ Ban Pengguna Diterapkan',
          subtitle: duration.label === 'permanen' ? 'Tanpa kedaluwarsa otomatis' : `Durasi ${duration.label}`,
          body: `Target: ${target}\nAlasan: ${reason}\nBerlaku: ${duration.until ? formatDate(duration.until) : 'permanen'}\n\nAkses command target ditolak oleh gerbang registrasi. Ban berdurasi akan dibersihkan otomatis ketika target menjalankan command setelah waktu kedaluwarsa.`,
          buttons: [{ name: 'quick_reply', title: 'Lihat Daftar Ban', id: `${prefix}listbans` }, { name: 'quick_reply', title: 'Buka Profil', id: `${prefix}getdata user ${target}` }]
        });
      } catch (error) { return ctx.reply(`❌ Ban gagal: ${clean(error?.message || error, 240)}`); }
    }

    if (['unbanned', 'unbanuser'].includes(command)) {
      const { target } = resolveTarget(ctx, rawArgs);
      const invalid = requireTargetSafety(ctx, target);
      if (invalid) return ctx.reply(`❌ ${invalid}\nFormat: ${prefix}unbanned @target (atau reply pesan target).`);
      try {
        const result = await unbanUser(target, { by: actor });
        return ctx.reply(result.wasBanned ? `✅ Ban pengguna ${target} dicabut.` : `ℹ️ ${target} sebelumnya tidak sedang diblokir.`);
      } catch (error) { return ctx.reply(`❌ Unban gagal: ${clean(error?.message || error, 240)}`); }
    }

    if (['addenergy', 'kurangenergy'].includes(command)) {
      const { target, args } = resolveTarget(ctx, rawArgs);
      const invalid = requireTargetSafety(ctx, target, { preventSelf: false });
      if (invalid) return ctx.reply(`❌ ${invalid}\nFormat: ${prefix}${command} @target <jumlah> [alasan]`);
      const amount = Number(args[0]);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) return ctx.reply('Jumlah harus berupa angka positif lebih dari 0 dan maksimal 10.000.');
      const user = await getUser(target).catch(() => null);
      if (!user) return ctx.reply('❌ Target belum ada di database pengguna Whiskay.');
      const delta = command === 'addenergy' ? amount : -amount;
      try {
        const result = await adjustEnergy(target, delta, { actor, reason: clean(args.slice(1).join(' '), 48) || command });
        return ctx.sendInteractive({
          title: '⚡ Penyesuaian Energi Berhasil',
          subtitle: `${result.before} → ${result.energy} / ${result.capacity}`,
          body: `Pengguna: ${target}\nPerubahan diminta: ${result.requestedDelta > 0 ? '+' : ''}${result.requestedDelta}\nPerubahan aktual: ${result.applied > 0 ? '+' : ''}${result.applied}\nEnergi akhir: ${result.energy}/${result.capacity}\nRiwayat admin: ${result.history.length} entri tersimpan (maksimal 50).${result.isCharging ? '\nStatus pengisian: aktif.' : '\nStatus pengisian: berhenti.'}`,
          buttons: [{ name: 'quick_reply', title: 'Daftar Energi', id: `${prefix}listenergy` }, { name: 'quick_reply', title: 'Profil Pengguna', id: `${prefix}getdata user ${target}` }]
        });
      } catch (error) { return ctx.reply(`❌ Penyesuaian energi gagal: ${clean(error?.message || error, 240)}`); }
    }

    if (command === 'getdata') {
      const { target, args } = resolveTarget(ctx, rawArgs);
      const first = String(args[0] || '').toLowerCase();
      if (first === 'stats' || (!first && !target)) {
        const [stats, database, energy] = await Promise.all([getUserStats(), readAppDatabase(), listEnergyUsers(1, 0)]);
        return ctx.sendInteractive({
          title: '🗃️ Whiskay Data Overview',
          subtitle: `Database schema ${database.schemaVersion || 1}`,
          body: `Total pengguna: ${stats.total}\nPengguna terdaftar: ${stats.registered}\nPengguna berstatus ban: ${stats.banned}\nRoom game: ${Object.keys(database.games || {}).length}\nRoom Werewolf: ${Object.keys(database.werewolfRooms || {}).length}\nPengguna di energy ledger: ${energy.total}\n\nMode ini hanya menampilkan statistik; tidak mengekspor rahasia, isi file, atau seluruh database.`,
          buttons: [{ name: 'quick_reply', title: 'Daftar Ban', id: `${prefix}listbans` }, { name: 'quick_reply', title: 'Daftar Energi', id: `${prefix}listenergy` }]
        });
      }
      const userTarget = target || (first === 'user' ? '' : '');
      if (!userTarget) return ctx.reply(`Gunakan ${prefix}getdata stats atau ${prefix}getdata user @target (boleh reply pesan target).`);
      const user = await getUser(userTarget).catch(() => null);
      return ctx.reply(safeUserSummary(user));
    }

    if (command === 'setdata') {
      const { target, args } = resolveTarget(ctx, rawArgs);
      if (!target) return ctx.reply(`Format: ${prefix}setdata user @target <nickname|note> <teks>\nField sengaja dibatasi; command ini tidak bisa mengubah field database arbitrary.`);
      const user = await getUser(target).catch(() => null);
      if (!user) return ctx.reply('❌ Pengguna tidak ditemukan di database Whiskay.');
      const offset = String(args[0] || '').toLowerCase() === 'user' ? 1 : 0;
      const field = String(args[offset] || '').toLowerCase();
      const key = FIELD_MAP[field];
      const value = clean(args.slice(offset + 1).join(' '), field === 'nickname' ? 80 : 240);
      if (!key || !value) return ctx.reply(`Field yang diizinkan: nickname (maks. 80 karakter) dan note (maks. 240 karakter).\nContoh: ${prefix}setdata user @target nickname Nama tampilan`);
      try {
        await updateUser(target, { [key]: value, ownerMetadataUpdatedAt: Date.now(), ownerMetadataUpdatedBy: actor });
        return ctx.reply(`✅ Metadata owner diperbarui.\nTarget: ${target}\nField: ${field}\nNilai: ${value}`);
      } catch (error) { return ctx.reply(`❌ Gagal memperbarui metadata: ${clean(error?.message || error, 240)}`); }
    }

    if (command === 'deldata') {
      const { target, args } = resolveTarget(ctx, rawArgs);
      if (!target) return ctx.reply(`Format: ${prefix}deldata user @target <nickname|note>`);
      const offset = String(args[0] || '').toLowerCase() === 'user' ? 1 : 0;
      const field = String(args[offset] || '').toLowerCase();
      const key = FIELD_MAP[field];
      if (!key) return ctx.reply('Field yang dapat dihapus hanya nickname atau note milik owner.');
      try {
        const result = await deleteUserOwnerMetadata(target, key);
        return ctx.reply(result.existed ? `✅ Metadata owner “${field}” dihapus dari ${target}.` : `ℹ️ Metadata “${field}” memang tidak ada pada ${target}.`);
      } catch (error) { return ctx.reply(`❌ Gagal menghapus metadata: ${clean(error?.message || error, 240)}`); }
    }

    if (command === 'listbans') {
      const database = await readAppDatabase();
      const users = Object.values(database.users || {}).filter(user => isUserBanActive(user))
        .sort((a, b) => Number(b.bannedAt || 0) - Number(a.bannedAt || 0));
      const rows = users.map((user, index) => {
        const expiry = Number(user.banUntil || 0) ? formatDate(user.banUntil) : 'permanen';
        return `${index + 1}. ${clean(user.ownerNickname || user.pushName || 'Pengguna', 80)} · ${clean(user.id, 180)}\n   Sampai: ${expiry}\n   Alasan: ${clean(user.banReason || 'Tidak dicantumkan', 120)}`;
      });
      const payload = paginate('⛔ PENGGUNA TERBLOKIR', rows, rawArgs[0], prefix, 'listbans');
      payload.body += '\n\nCatatan: daftar ini hanya menampilkan ban yang masih aktif; baris ban kedaluwarsa dibersihkan saat pengguna menjalankan command berikutnya.';
      return ctx.sendInteractive(payload);
    }

    if (command === 'listenergy') {
      const firstPage = await listEnergyUsers(1, 0);
      const totalPages = Math.max(1, Math.ceil(firstPage.total / PAGE_SIZE));
      const current = page(rawArgs[0], totalPages);
      const result = await listEnergyUsers(PAGE_SIZE, (current - 1) * PAGE_SIZE);
      const visible = result.users;
      const rows = visible.map((user, index) => `${(current - 1) * PAGE_SIZE + index + 1}. ${user.user}\n   Energi: ${user.energy}/${user.capacity} · Pengisian: ${user.isCharging ? 'aktif' : 'tidak'} · Premium: ${Number(user.premiumUntil) > Date.now() ? formatDate(user.premiumUntil) : 'nonaktif'}`);
      return ctx.sendInteractive({
        title: '⚡ ENERGY LEDGER', subtitle: `Halaman ${current}/${totalPages}`,
        body: `${rows.join('\n') || 'Tidak ada data energi.'}\n\nTotal user pada ledger: ${result.total}`,
        buttons: [
          ...(current > 1 ? [{ name: 'quick_reply', title: '⬅️ Sebelumnya', id: `${prefix}listenergy ${current - 1}` }] : []),
          ...(current < totalPages ? [{ name: 'quick_reply', title: 'Berikutnya ➡️', id: `${prefix}listenergy ${current + 1}` }] : []),
          { name: 'quick_reply', title: '🔄 Refresh', id: `${prefix}listenergy ${current}` }
        ]
      });
    }

    return ctx.reply(`Owner management:\n• ${prefix}banned @target <durasi|permanent> [alasan]\n• ${prefix}unbanned @target\n• ${prefix}addenergy @target <jumlah> [alasan]\n• ${prefix}kurangenergy @target <jumlah> [alasan]\n• ${prefix}getdata stats | user @target\n• ${prefix}setdata user @target <nickname|note> <teks>\n• ${prefix}deldata user @target <nickname|note>\n• ${prefix}listbans [halaman]\n• ${prefix}listenergy [halaman]`);
  }
};

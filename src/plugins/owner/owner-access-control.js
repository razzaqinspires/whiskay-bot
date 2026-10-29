import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import config from '../../config/index.js';
import { sameUser, isOwner as isConfiguredOwner } from '../../lib/security.js';
import { addManagedOwner, getManagedOwners, isPrimaryOwner, removeManagedOwner } from '../../lib/owner-access.js';

const clean = (v, n = 180) => String(v || '').replace(/[\r\n\u0000-\u001f]/g, ' ').trim().slice(0, n);
function targetFrom(ctx, args) {
  const mention = ctx.mentions?.[0] || ctx.mentionedJid?.[0] || ctx.mentionedJids?.[0] || '';
  const quoted = ctx.quoted?.sender || ctx.quoted?.key?.participant || '';
  const raw = mention || quoted || args.find(x => /^\d{8,15}(?:@s\.whatsapp\.net)?$/i.test(String(x))) || '';
  const target = String(raw).trim().replace(/^@/, '');
  if (/^\d{8,15}$/.test(target)) return `${target}@s.whatsapp.net`;
  if (/^\d{8,15}@s\.whatsapp\.net$/i.test(target)) return target;
  return '';
}
function phoneOnly(jid) { return /^\d{8,15}@s\.whatsapp\.net$/i.test(jid); }
async function sessionReport() {
  const dir = path.resolve(config.sessionDir || './sessions');
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return { dir, entries: [], exists: false }; throw error; }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    try {
      const info = await stat(path.join(dir, entry.name));
      files.push({ name: entry.name, size: info.size, modified: info.mtimeMs });
    } catch {}
  }
  return { dir, entries: files, exists: true };
}
export const ownerAccessControlInternals = { targetFrom, phoneOnly };
export default {
  name: 'owner-access-control',
  command: ['addowner', 'delowner', 'listowners', 'blockuser', 'unblockuser', 'sessionstatus'],
  category: 'owner', owner: true, energyMode: 'free', energyCost: 0, cooldown: 1500,
  description: 'Owner utama: kelola owner runtime, blokir WhatsApp terkonfirmasi, dan inspeksi sesi read-only',
  async execute(ctx) {
    const command = String(ctx.command || '').toLowerCase();
    const args = Array.isArray(ctx.args) ? ctx.args.map(String) : [];
    const prefix = String(ctx.prefix || '.');
    if (!ctx.isOwner) return ctx.reply('🔒 Perintah ini khusus owner.');

    if (['addowner', 'delowner'].includes(command)) {
      if (!isPrimaryOwner(ctx.sender, config)) return ctx.reply('🔒 Hanya owner utama yang dikonfigurasi melalui OWNERS yang boleh mengubah daftar owner.');
      const target = targetFrom(ctx, args);
      if (!target) return ctx.reply(`Target PN/nomor valid wajib disebutkan atau direply.\nContoh: ${prefix}${command} @target`);
      if (command === 'addowner') {
        try {
          const result = addManagedOwner(target);
          const msg = result.reason === 'primary' ? 'Target sudah terdaftar sebagai owner utama.' : result.reason === 'exists' ? 'Target sudah menjadi owner runtime.' : `Owner runtime ditambahkan: ${target}. Hak akses berlaku setelah database disimpan dan langsung dikenali oleh pemeriksaan owner berikutnya.`;
          return ctx.reply(`✅ ${msg}`);
        } catch (error) { return ctx.reply(`❌ ${clean(error.message)}`); }
      }
      const result = removeManagedOwner(target);
      if (result.reason === 'primary') return ctx.reply('⛔ Owner utama tidak dapat dihapus melalui command ini. Ubah OWNERS secara manual jika memang diperlukan.');
      return ctx.reply(result.changed ? `✅ Owner runtime dihapus: ${target}` : `ℹ️ ${target} tidak ditemukan pada daftar owner runtime.`);
    }

    if (command === 'listowners') {
      const primary = (config.owners || []).map(x => `• ${x} — owner utama (.env)`);
      const managed = getManagedOwners().map(x => `• ${x} — owner runtime (data/owner-access.json)`);
      return ctx.sendInteractive({ title: '🔐 DAFTAR OWNER', subtitle: `${primary.length + managed.length} entri`, body: [...primary, ...managed].join('\n') || 'Belum ada owner terkonfigurasi. Isi OWNERS pada .env.', buttons: [{ name: 'quick_reply', title: 'Refresh', id: `${prefix}listowners` }] });
    }

    if (['blockuser', 'unblockuser'].includes(command)) {
      if (!isPrimaryOwner(ctx.sender, config)) return ctx.reply('🔒 Aksi block WhatsApp hanya untuk owner utama yang dikonfigurasi di OWNERS.');
      const target = targetFrom(ctx, args);
      if (!target) return ctx.reply(`Sebut/reply target nomor WhatsApp PN yang valid.\nContoh: ${prefix}${command} @target confirm`);
      if (!phoneOnly(target)) return ctx.reply('Untuk menghindari salah identitas, aksi block hanya menerima PN/nomor telepon; LID tidak diterima.');
      if (sameUser(target, ctx.sender) || isConfiguredOwner([target], config)) return ctx.reply('⛔ Tidak dapat memblokir owner atau akun sendiri.');
      if (String(args.at(-1) || '').toLowerCase() !== 'confirm') return ctx.reply(`⚠️ Ini mengubah blocklist akun WhatsApp bot. Konfirmasi dengan:\n${prefix}${command} ${target} confirm`);
      if (typeof ctx.sock?.updateBlockStatus !== 'function') return ctx.reply('Socket WhatsApp tidak menyediakan updateBlockStatus; tidak ada perubahan dilakukan.');
      try {
        await ctx.sock.updateBlockStatus(target, command === 'blockuser' ? 'block' : 'unblock');
        return ctx.reply(`✅ ${command === 'blockuser' ? 'Blokir diterapkan' : 'Blokir dicabut'} untuk ${target}. Ini mengubah blocklist WhatsApp bot, bukan ban command internal Whiskay.`);
      } catch (error) { return ctx.reply(`❌ Operasi block gagal: ${clean(error?.message || error)}`); }
    }

    if (command === 'sessionstatus') {
      try {
        const report = await sessionReport();
        const totalBytes = report.entries.reduce((sum, f) => sum + f.size, 0);
        const rows = report.entries.slice().sort((a,b) => b.modified-a.modified).slice(0, 25).map(f => `• ${clean(f.name, 120)} · ${f.size} byte · ${new Date(f.modified).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false })}`);
        return ctx.sendInteractive({ title: '🔎 SESSION STATUS (READ-ONLY)', subtitle: report.exists ? `${report.entries.length} file · ${(totalBytes/1024).toFixed(1)} KiB` : 'Direktori sesi belum ada', body: `Direktori: ${report.dir}\n${rows.join('\n') || 'Tidak ada file sesi untuk ditampilkan.'}\n\nTidak ada file sesi yang dibaca isinya, dihapus, atau diubah. Jangan hapus creds.json maupun key store Baileys secara manual ketika bot sedang berjalan.`, buttons: [{ name: 'quick_reply', title: 'Refresh', id: `${prefix}sessionstatus` }, { name: 'quick_reply', title: 'Ops Status', id: `${prefix}opsstatus` }] });
      } catch (error) { return ctx.reply(`Gagal membaca metadata sesi: ${clean(error?.message || error)}`); }
    }
    return ctx.reply(`Owner access control:\n• ${prefix}addowner @target\n• ${prefix}delowner @target\n• ${prefix}listowners\n• ${prefix}blockuser @target confirm\n• ${prefix}unblockuser @target confirm\n• ${prefix}sessionstatus`);
  }
};

import config from '../../config/index.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const normalizeJid = value => String(value || '').trim();
async function registeredUsers() {
  try {
    const raw = JSON.parse(await readFile(path.resolve('data/registered-users.json'), 'utf8'));
    const list = Array.isArray(raw) ? raw : Array.isArray(raw.users) ? raw.users : [];
    return list.map(x => normalizeJid(typeof x === 'string' ? x : x?.jid)).filter(x => /^\d+@s\.whatsapp\.net$/.test(x));
  } catch { return []; }
}
export default {
  name: 'broadcast', command: ['bc', 'broadcast'], category: 'owner', owner: true, cooldown: 15000,
  description: 'Pengumuman owner ke grup atau pengguna terdaftar',
  async execute(ctx) {
    if (!ctx.isOwner) return ctx.reply('🔒 Fitur broadcast hanya untuk owner bot.');
    const raw = String(ctx.args?.join(' ') || '').trim();
    if (!raw || ['help','--help'].includes(raw.toLowerCase())) return ctx.reply(`📣 *BROADCAST OWNER*\n\`.bc pesan\` — kirim ke grup yang diikuti bot\n\`.bc --preview pesan\` — hitung target tanpa mengirim\n\`.bc --users pesan\` — grup + pengguna terdaftar\n\`.bc --groups pesan\` — hanya grup\n\nBroadcast berjalan bertahap dengan jeda untuk mengurangi risiko rate-limit. Gunakan hanya untuk pengumuman yang relevan.`);
    let mode = 'groups', message = raw, previewOnly = false;
    if (raw.startsWith('--preview ')) { previewOnly = true; message = raw.slice(10).trim(); }
    if (message.startsWith('--users ')) { mode = 'both'; message = message.slice(8).trim(); }
    else if (message.startsWith('--groups ')) { mode = 'groups'; message = message.slice(9).trim(); }
    if (!message) return ctx.reply('Teks pengumuman kosong. Gunakan `.bc pesan`');
    if (message.length > 3500) return ctx.reply('Teks terlalu panjang (maksimal 3500 karakter).');
    const sock = ctx.sock;
    if (!sock || typeof sock.sendMessage !== 'function') return ctx.reply('❌ Koneksi WhatsApp tidak tersedia.');
    let groupIds = [];
    try {
      const groups = await sock.groupFetchAllParticipating();
      groupIds = Object.keys(groups || {}).filter(jid => jid.endsWith('@g.us'));
    } catch (error) { console.error('[BC] failed to list groups:', error?.message || error); return ctx.reply('❌ Tidak bisa mengambil daftar grup. Broadcast dibatalkan.'); }
    const userIds = mode === 'both' ? await registeredUsers() : [];
    const targets = [...new Set([...groupIds, ...userIds])].filter(jid => jid !== ctx.chat);
    if (!targets.length) return ctx.reply('Tidak ada target broadcast. Pastikan bot sudah bergabung ke grup atau data/registered-users.json sudah diisi.');
    if (previewOnly) return ctx.sendInteractive({title:'📣 Broadcast Preview',body:`Mode: ${mode}
Target grup: ${groupIds.length}
Pengguna terdaftar: ${userIds.length}
Total unik setelah mengecualikan chat ini: ${targets.length}
Panjang pesan: ${message.length} karakter

Tidak ada pesan yang dikirim pada preview. Jalankan .bc pesan setelah memeriksa target.`,buttons:[{name:'quick_reply',title:'Batal',id:`${ctx.prefix}bc help`},{name:'quick_reply',title:'Lihat status',id:`${ctx.prefix}status`}]});
    await ctx.reply(`📣 *BROADCAST DIMULAI*\nTarget: ${targets.length}\nGrup: ${groupIds.length}\nPengguna terdaftar: ${userIds.length}\n\nPengiriman dilakukan bertahap.`);
    let sent = 0, failed = 0;
    for (const jid of targets) {
      try { await sock.sendMessage(jid, { text: `📢 *PENGUMUMAN WHISKAYBOT*\n\n${message}\n\n_Informasi resmi dari pengelola bot._` }); sent++; }
      catch (error) { failed++; console.error('[BC] send failed:', jid, error?.message || error); }
      await sleep(900);
    }
    return ctx.reply(`✅ *BROADCAST SELESAI*\nBerhasil: ${sent}\nGagal: ${failed}\nTotal target: ${targets.length}`);
  }
};

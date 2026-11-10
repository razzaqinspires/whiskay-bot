import { runWithOutboundContext } from '../../core/OutboundTrafficGuard.js';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import config from '../../config/index.js';
import { serializeMessage, attachSerializerRuntime } from '../../core/serializer.js';
import { outboundTrafficGuard } from '../../core/OutboundTrafficGuard.js';
import { registry } from '../../core/registry.js';
import { hasPremium } from '../../lib/energy-worker.js';
import { getUser, chargeBalance } from '../../lib/app-database.js';
import { createPairingTicket, consumePairingTicket, waitForPortalUrl, getPortalMode } from '../../services/jadibotPortal.js';
import { jadibotStore } from '../../services/JadibotStore.js';

const DAY = 86400000;
let DAYS = Math.max(1, Number(process.env.JADIBOT_DEFAULT_DAYS || 30));
let PRICE = Math.max(0, Number(process.env.JADIBOT_PRICE_30D || 10000));
const ROOT = jadibotStore.root;
const jadibotRuntime = globalThis[Symbol.for('whiskay.jadibot.runtime')] ||= { sockets: new Map(), expiryTimer: null, expirySweep: null, generation: 0 };
const moduleGeneration = ++jadibotRuntime.generation;
const sockets = jadibotRuntime.sockets;
let settingsLoaded = false;
const idOf = jid => String(jid || '').split('@')[0].split(':')[0].replace(/[^\w-]/g, '').slice(0, 80);
const money = n => new Intl.NumberFormat('id-ID').format(Number(n) || 0);
async function loadSettings() {
  if (settingsLoaded) return;
  const x = await jadibotStore.readSettings({});
  if (Number.isInteger(x.days) && x.days >= 1 && x.days <= 365) DAYS = x.days;
  if (Number.isFinite(x.price) && x.price >= 0 && x.price <= 1e8) PRICE = x.price;
  settingsLoaded = true;
}
async function saveSettings() {
  await jadibotStore.writeSettings({ days: DAYS, price: PRICE, updatedAt: new Date().toISOString() });
}
const dbRead = () => jadibotStore.readRentals();
const dbChange = fn => jadibotStore.changeRentals(fn);
const sessionDir = key => path.join(ROOT, 'sessions', key);
const owner = ctx => Boolean(ctx.isOwner);
async function allowed(ctx) { return owner(ctx) || await hasPremium(ctx.sender || ctx.chat).catch(() => false); }
async function paymentConfig() { try { const m = await import('../../lib/energy-worker.js'); return await m.getPaymentConfig(); } catch { return {}; } }
function methods(p) {
  const out = [];
  for (const k of ['bank', 'ewallet']) for (const x of p[k] || []) out.push(`• ${k.toUpperCase()} ${x.name}: ${x.number} a.n. ${x.owner}`);
  if (p.qrisPath) out.push('• QRIS sudah dikonfigurasi; minta QR kepada owner.');
  return out.join('\n') || 'Metode pembayaran belum diatur. Hubungi owner.';
}
async function stop(key, logout = false) {
  const sock = sockets.get(key);
  sockets.delete(key);
  if (sock) { try { logout ? await sock.logout() : sock.end(new Error('stopped')); } catch {} }
  if (logout) await rm(sessionDir(key), { recursive: true, force: true }).catch(() => {});
}
async function start(ctx, mode, phone = '') {
  if (!await allowed(ctx)) throw new Error('Fitur jadibot hanya untuk owner dan pengguna Premium aktif.');
  if (ctx.isGroup) throw new Error('Gunakan fitur ini melalui chat pribadi bot untuk menjaga keamanan konfirmasi pairing.');
  const user = ctx.sender || ctx.chat;
  const key = idOf(user);
  if (!key) throw new Error('ID pengguna tidak valid.');
  const all = await dbRead();
  let row = all[key];
  if (row && row.expiresAt <= Date.now()) throw new Error('Masa aktif habis. Gunakan .perpanjang.');
  if (sockets.has(key)) throw new Error('Sesi sudah berjalan. Gunakan .jadibotstatus.');
  if (!row) {
    if (!owner(ctx)) {
      const account = await getUser(user);
      if (!account?.registered) throw new Error('Daftar terlebih dahulu dengan .daftar.');
      if ((Number(account.balance) || 0) < PRICE) throw new Error(`Saldo tidak cukup. Harga sewa Rp${money(PRICE)} untuk ${DAYS} hari. Gunakan .topup ${PRICE}, selesaikan pembayaran, lalu coba lagi.`);
      await chargeBalance(user, PRICE, 'jadibot-sewa-awal');
    }
    row = { user, startedAt: Date.now(), expiresAt: Date.now() + DAYS * DAY, connected: false, phone: '', mode, chargedAmount: owner(ctx) ? 0 : PRICE };
    await dbChange(d => { d[key] = row; });
  } else {
    await dbChange(d => { if (d[key]) { d[key].mode = mode; d[key].needsPairing = false; } });
  }
  await mkdir(sessionDir(key), { recursive: true, mode: 0o700 });
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir(key));
  const { version } = await fetchLatestBaileysVersion();
  const silentLogger = { trace() {}, debug() {}, info() {}, warn() {}, error() {}, child() { return this; } };
  const sock = makeWASocket({
    version,
    browser: Browsers.ubuntu('Chrome'),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, silentLogger) },
    markOnlineOnConnect: false,
    syncFullHistory: false,
    printQRInTerminal: false,
    getMessage: async () => ({ conversation: '' })
  });
  // Serializer setup installs message-ID wrappers. Attach the outbound policy
  // guard afterwards so every sendMessage/relayMessage call is intercepted.
  attachSerializerRuntime(sock);
  outboundTrafficGuard.attach(sock);
  sockets.set(key, sock);
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', async upsert => {
    if (upsert.type !== 'notify' || !registry.bot?._cmd) return;
    for (const raw of upsert.messages || []) {
      if (!raw.message) continue;
      try {
        const subCtx = await serializeMessage(sock, raw, config, registry.bot);
        if (!subCtx?.body || subCtx.isBot) continue;
        if (!/^[.,!/#]/.test(String(subCtx.body).trim())) continue;
        await registry.bot._cmd.handle(subCtx);
      } catch (error) { console.warn('[jadibot] message handler failed:', error?.message || error); }
    }
  });
  sock.ev.on('connection.update', async update => {
    if (update.qr && mode === 'qr') {
      try { qrcode.generate(update.qr, { small: true }); } catch {}
      await ctx.reply('📷 QR login tampil di terminal server. Scan segera melalui WhatsApp > Perangkat tertaut. QR tidak dikirim ke layanan pihak ketiga.').catch(() => {});
    }
    if (update.connection === 'open') {
      const number = String(sock.user?.id || '').split(':')[0].split('@')[0];
      await dbChange(d => { if (d[key]) { d[key].connected = true; d[key].phone = number; d[key].lastConnectedAt = Date.now(); d[key].mode = mode; } }).catch(() => {});
      await ctx.reply(`✅ Sub-bot terhubung: ${number}. Sesi disimpan secara terpisah.`).catch(() => {});
    }
    if (update.connection === 'close') {
      if (sockets.get(key) === sock) sockets.delete(key);
      const code = new Boom(update.lastDisconnect?.error)?.output?.statusCode;
      await dbChange(d => { if (d[key]) { d[key].connected = false; d[key].lastDisconnectedAt = Date.now(); } }).catch(() => {});
      if (code === DisconnectReason.loggedOut) {
        await rm(sessionDir(key), { recursive: true, force: true }).catch(() => {});
        await ctx.reply('⚠️ Akun sub-bot logout/unlink. Jalankan .jadibotlogin untuk menghubungkan kembali jika masa sewa masih aktif.').catch(() => {});
      }
    }
  });
  if (mode === 'pairing' && !state.creds.registered) {
    const n = String(phone || '').replace(/\D/g, '');
    if (!/^\d{8,15}$/.test(n) || n.startsWith('0')) { await stop(key); throw new Error('Nomor harus menggunakan kode negara, contoh 628123456789.'); }
    const mainNumber = String(registry.sock?.user?.id || registry.bot?.sock?.user?.id || '').split(':')[0].split('@')[0].replace(/\D/g, '');
    if (mainNumber && n === mainNumber) { await stop(key); throw new Error('Nomor sub-bot harus berbeda dari nomor bot utama.'); }
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(n);
        const pretty = code ? code.match(/.{1,4}/g).join('-') : code;
        await ctx.reply(`🔐 *WHISKAY · PAIRING CODE*\n\nNomor: ${n}\nKode: *${pretty}*\n\n1. Buka WhatsApp pada nomor tersebut.\n2. Perangkat tertaut → Tautkan perangkat.\n3. Pilih “Tautkan dengan nomor telepon”.\n4. Masukkan kode di atas.\n\nJangan bagikan kode ini kepada siapa pun.`);
      } catch (error) {
        await ctx.reply(`Gagal membuat pairing code: ${error?.message || 'kesalahan tidak diketahui'}. Buat tautan pairing baru dengan .jadibot pairing.`).catch(() => {});
        await stop(key).catch(() => {});
      }
    }, 1800);
  }
}
function status(row) {
  if (!row) return 'Belum ada sesi jadibot.';
  const left = Math.max(0, row.expiresAt - Date.now());
  return `🤖 *STATUS JADIBOT*\nStatus: ${left ? (row.connected ? '🟢 Terhubung' : '🟡 Sesi tersimpan/offline') : '🔴 Kedaluwarsa'}\nNomor: ${row.phone || '-'}\nMasa aktif sampai: ${new Date(row.expiresAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\nSisa: ${Math.ceil(left / DAY)} hari\nHarga ${DAYS} hari: Rp${money(PRICE)}`;
}
async function ownersNotify(ctx, text) { for (const jid of config.owners || []) try { await ctx.sock.sendMessage(jid, { text }); } catch {} }
// Keep one expiry worker across plugin hot reloads. The timer calls the latest
// module generation through the shared runtime slot, avoiding stale closures.
jadibotRuntime.expirySweep = async () => {
  try {
    const db = await dbRead();
    const now = Date.now();
    for (const [key, row] of Object.entries(db)) {
      if (!row || !row.expiresAt || row.expiresAt > now || row.expirationHandledAt) continue;
      await stop(key, false).catch(() => {});
      let claimedExpiry = false;
      await dbChange(current => {
        if (current[key] && !current[key].expirationHandledAt && current[key].expiresAt <= Date.now()) {
          current[key].connected = false;
          current[key].expirationHandledAt = Date.now();
          claimedExpiry = true;
        }
      }).catch(() => {});
      if (!claimedExpiry) continue;
      const mainSock = registry.sock || registry.bot?.sock;
      if (row.user && mainSock?.sendMessage) {
        await runWithOutboundContext({ source: 'jadibot:expiry', command: 'jadibot-expiry' }, () => mainSock.sendMessage(row.user, { text: '⏳ Masa sewa WHISKAY Jadibot kamu sudah berakhir. Sesi dihentikan. Gunakan .perpanjang untuk memperpanjang, lalu .jadibotlogin untuk menghubungkan kembali.' })).catch(() => {});
      }
    }
  } catch (error) { console.warn('[jadibot] expiry worker failed:', error?.message || error); }
};
if (!jadibotRuntime.expiryTimer) {
  jadibotRuntime.expiryTimer = setInterval(() => { void jadibotRuntime.expirySweep?.(); }, 60_000);
  jadibotRuntime.expiryTimer.unref?.();
}
async function showPairingPortal(ctx, key) {
  if (!await allowed(ctx)) return ctx.reply('💎 Fitur jadibot hanya untuk owner dan pengguna Premium aktif.');
  if (ctx.isGroup) return ctx.reply('🔐 Demi keamanan, mulai pairing dari chat pribadi bot.');
  const base = await waitForPortalUrl(Number(process.env.JADIBOT_PUBLIC_URL_WAIT_MS || 15000));
  if (!base) {
    const mode = getPortalMode();
    const hint = mode === 'external-required'
      ? 'Server/deployment terdeteksi dan TryCloudflare dinonaktifkan. Atur JADIBOT_PUBLIC_URL ke URL HTTPS portal yang dipetakan ke port JADIBOT_PORT.'
      : 'Mini-web belum memiliki URL publik. Periksa log TryCloudflare atau pasang cloudflared.';
    return ctx.reply(`🌐 *PAIRING PORTAL BELUM SIAP*\n${hint}\n\nAlternatif sementara: .jadibot pairing 628xxxxxxxxxx`);
  }
  const ticket = await createPairingTicket({ userJid: ctx.sender || ctx.chat, userKey: key });
  const url = `${base}/pair/${ticket.id}`;
  return ctx.sendInteractive({
    title: '🔐 WHISKAY · PAIRING PORTAL',
    subtitle: 'Tautan privat · berlaku 10 menit',
    body: 'Tekan tombol untuk membuka mini-web resmi Whiskay. Masukkan nomor WhatsApp yang kamu miliki. Setelah itu WhatsApp akan terbuka kembali dengan pesan konfirmasi yang harus kamu kirim. Pairing code hanya dikirim oleh bot di chat ini.',
    footer: 'Jangan teruskan tautan atau kode pairing kepada siapa pun.',
    buttons: [
      { name: 'cta_url', title: 'Buka Pairing Portal', url },
      { name: 'quick_reply', title: 'Cek Status', id: '.jadibotstatus' }
    ]
  });
}

export default {
  name: 'jadibot',
  command: ['jadibot', 'jadibotconfirm', 'jadibotstatus', 'jadibotlogin', 'jadibotlogout', 'perpanjang', 'buktijadibot', 'listjadibot', 'jadibotapprove', 'stopjadibot', 'setjadibotharga', 'setjadibotdurasi', 'setjadibotpay', 'setjadibotpremium'],
  menuCommands: ['jadibot', 'jadibotstatus', 'jadibotlogin', 'jadibotlogout', 'perpanjang'],
  category: 'premium', description: 'Sewa sub-bot QR/pairing, portal web, status, perpanjangan dan kontrol owner', cooldown: 2500,
  async dispose({ reason = 'plugin-reload' } = {}) {
    if (jadibotRuntime.generation !== moduleGeneration) return { skipped: true, reason: 'superseded-generation' };
    if (jadibotRuntime.expiryTimer) clearInterval(jadibotRuntime.expiryTimer);
    jadibotRuntime.expiryTimer = null;
    jadibotRuntime.expirySweep = null;
    if (reason === 'bot-shutdown' || reason === 'plugin-unload') {
      for (const key of [...sockets.keys()]) await stop(key, false).catch(() => {});
    }
    return { disposed: true, reason };
  },
  async execute(ctx) {
    await loadSettings();
    const cmd = ctx.command, a = ctx.args || [], user = ctx.sender || ctx.chat, key = idOf(user);
    if (cmd === 'jadibot') {
      if (!await allowed(ctx)) return ctx.reply('💎 Fitur jadibot hanya untuk owner dan pengguna Premium aktif.');
      const mode = String(a[0] || '').toLowerCase();
      if (!mode) return ctx.sendInteractive({ title: '🤖 WHISKAY JADIBOT', subtitle: `${DAYS} hari · Rp${money(PRICE)}`, body: `Pilih metode login. Gunakan hanya akun WhatsApp milik sendiri.\n\n${owner(ctx) ? 'Akses owner: biaya sewa dilewati.' : `Harga: Rp${money(PRICE)} untuk ${DAYS} hari. Selesaikan top-up dan pastikan saldo cukup sebelum pairing.`}\nSetelah mengirim konfirmasi, cek chat WhatsApp ini untuk status dan kode pairing.`, buttons: [{ name: 'quick_reply', title: '📷 QR Code', id: '.jadibot qr' }, { name: 'quick_reply', title: '🔐 Pairing Code', id: '.jadibot pairing' }, { name: 'quick_reply', title: '💳 Harga & perpanjang', id: '.perpanjang' }] });
      if (mode === 'qr' || mode === 'qrcode') return start(ctx, 'qr');
      if (mode === 'pairing' || mode === 'code') {
        if (!owner(ctx)) {
          const account = await getUser(user);
          if (!account?.registered) return ctx.reply('🔐 Daftar terlebih dahulu dengan .daftar.');
          if ((Number(account.balance) || 0) < PRICE) return ctx.reply(`💳 Pembayaran belum selesai atau saldo tidak cukup. Harga sewa Rp${money(PRICE)} untuk ${DAYS} hari.\n1. Gunakan .topup ${PRICE}\n2. Selesaikan pembayaran dan tunggu owner menyetujui top-up.\n3. Cek .saldo lalu ulangi .jadibot pairing.`);
        }
        if (!a[1]) return showPairingPortal(ctx, key);
        // Backwards-compatible manual path for owner/admin troubleshooting.
        return start(ctx, 'pairing', a[1]);
      }
      return ctx.reply('Gunakan .jadibot, .jadibot qr, atau .jadibot pairing untuk membuka mini-web pairing.');
    }
    if (cmd === 'jadibotconfirm') {
      if (!await allowed(ctx)) return ctx.reply('💎 Akses Premium tidak aktif.');
      if (ctx.isGroup) return ctx.reply('Konfirmasi pairing hanya diterima melalui chat pribadi bot.');
      const token = String(a[0] || '').trim();
      if (!token) return ctx.reply('Token konfirmasi tidak ada. Ulangi dari .jadibot pairing.');
      const result = await consumePairingTicket(token, key);
      if (!result.ok) return ctx.reply(`❌ ${result.error}`);
      return start(ctx, 'pairing', result.ticket.phone);
    }
    if (cmd === 'jadibotstatus') return ctx.reply(status((await dbRead())[key]));
    if (cmd === 'jadibotlogin') {
      const row = (await dbRead())[key];
      if (!row || row.expiresAt <= Date.now()) return ctx.reply('Sesi tidak ada atau sudah habis. Gunakan .perpanjang.');
      if (row.needsPairing && row.mode !== 'qr') return showPairingPortal(ctx, key);
      return start(ctx, row.mode || 'qr');
    }
    if (cmd === 'jadibotlogout') {
      await stop(key, true);
      await dbChange(d => { if (d[key]) { d[key].connected = false; d[key].loggedOutAt = Date.now(); d[key].needsPairing = d[key].mode !== 'qr'; } });
      return ctx.reply('✅ Sesi sub-bot logout dan kredensial lokal dihapus. Masa sewa tetap berjalan. Gunakan .jadibotlogin; mode pairing akan membuka kembali portal nomor.');
    }
    if (cmd === 'perpanjang') {
      const days = Math.max(1, Math.min(365, Number(a[0] || DAYS) || DAYS));
      const amount = Math.round(PRICE * days / DAYS);
      const existing = (await dbRead())[key];
      if (!owner(ctx)) {
        try { await chargeBalance(user, amount, 'jadibot-perpanjangan'); }
        catch (e) { return ctx.reply(`💳 Saldo belum cukup untuk perpanjangan ${days} hari (Rp${money(amount)}).\n${e.message}\n\nGunakan .topup ${amount}, selesaikan pembayaran dan tunggu persetujuan owner.`); }
      }
      let expiresAt = 0;
      await dbChange(d => {
        const current = d[key] || { user, startedAt: Date.now(), connected: false };
        expiresAt = Math.max(Date.now(), Number(current.expiresAt) || 0) + days * DAY;
        current.expiresAt = expiresAt;
        current.pendingPayment = null;
        current.expirationHandledAt = null;
        d[key] = current;
      });
      return ctx.reply(`✅ *PERPANJANGAN JADIBOT BERHASIL*\nDurasi tambahan: ${days} hari\nBiaya: ${owner(ctx) ? 'Gratis (owner)' : `Rp${money(amount)}`}\nMasa aktif sampai: ${new Date(expiresAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n\nCek status: .jadibotstatus`);
    }
    if (cmd === 'buktijadibot') {
      const ref = String(a[0] || ''), row = (await dbRead())[key];
      if (!ref || row?.pendingPayment?.ref !== ref || row.pendingPayment.status !== 'pending') return ctx.reply('Referensi tidak valid. Gunakan .perpanjang untuk membuat permintaan.');
      let media = null;
      if (ctx.quoted) media = await ctx.download(ctx.quoted).catch(() => null);
      for (const jid of config.owners || []) try {
        if (media) await ctx.sock.sendMessage(jid, { image: media, caption: `Bukti pembayaran jadibot\nUser: ${user}\nRef: ${ref}\nNominal: Rp${money(row.pendingPayment.amount)}\nVerifikasi dana secara manual.` });
        await ctx.sock.sendMessage(jid, { text: `Approve jika dana masuk: .jadibotapprove ${key}` });
      } catch {}
      return ctx.reply('Bukti diteruskan ke owner jika gambar dilampirkan. Tunggu verifikasi manual.');
    }
    if (cmd === 'listjadibot') {
      if (!owner(ctx)) return ctx.reply('Owner only.');
      const db = await dbRead();
      return ctx.reply('📋 *JADIBOT*\n' + (Object.entries(db).map(([k, r]) => `${k} | ${r.phone || '-'} | ${r.connected ? 'online' : 'offline'} | ${Math.ceil(Math.max(0, r.expiresAt - Date.now()) / DAY)} hari`).join('\n') || 'Kosong'));
    }
    if (cmd === 'jadibotapprove') {
      if (!owner(ctx)) return ctx.reply('Owner only.');
      const target = idOf(a[0]);
      let approved = null;
      await dbChange(d => {
        const row = d[target];
        if (!row?.pendingPayment || row.pendingPayment.status !== 'pending') return;
        const payment = row.pendingPayment;
        payment.status = 'approved'; payment.approvedAt = Date.now(); payment.approvedBy = key;
        row.expiresAt = Math.max(Date.now(), Number(row.expiresAt) || 0) + payment.days * DAY;
        row.startedAt = row.startedAt || Date.now();
        approved = { ref: payment.ref, days: payment.days, expiresAt: row.expiresAt };
      });
      if (!approved) return ctx.reply('Tidak ada pembayaran pending.');
      return ctx.reply(`✅ Pembayaran ${approved.ref} disetujui. Masa aktif bertambah ${approved.days} hari, berakhir ${new Date(approved.expiresAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB.`);
    }
    if (cmd === 'stopjadibot') {
      if (!owner(ctx)) return ctx.reply('Owner only. Format: .stopjadibot USERKEY');
      const target = idOf(a[0]);
      if (!target) return ctx.reply('Format: .stopjadibot USERKEY');
      await stop(target, true);
      await dbChange(d => { if (d[target]) { d[target].connected = false; d[target].stoppedByOwnerAt = Date.now(); } });
      return ctx.reply(`Sesi ${target} dihentikan.`);
    }
    if (cmd === 'setjadibotharga') {
      if (!owner(ctx)) return ctx.reply('Owner only.');
      const n = Number(a[0]);
      if (!Number.isFinite(n) || n < 0 || n > 1e8) return ctx.reply('Format: .setjadibotharga 15000');
      PRICE = Math.floor(n); await saveSettings();
      return ctx.reply(`✅ Harga jadibot disimpan: Rp${money(PRICE)} per ${DAYS} hari.`);
    }
    if (cmd === 'setjadibotdurasi') {
      if (!owner(ctx)) return ctx.reply('Owner only.');
      const n = Number(a[0]);
      if (!Number.isInteger(n) || n < 1 || n > 365) return ctx.reply('Format: .setjadibotdurasi 30');
      DAYS = n; await saveSettings();
      return ctx.reply(`✅ Durasi default disimpan: ${DAYS} hari.`);
    }
    if (cmd === 'setjadibotpay') return owner(ctx) ? ctx.reply('Gunakan command yang sudah tersedia: .setpayment bank Nama|Nomor|Pemilik, .setpayment ewallet Nama|Nomor|Pemilik, atau .setpayment qris.') : ctx.reply('Owner only.');
    if (cmd === 'setjadibotpremium') return owner(ctx) ? ctx.reply('Gunakan .premium @user 30 untuk mengatur premium; jadibot memeriksa status premium yang sama.') : ctx.reply('Owner only.');
  }
};

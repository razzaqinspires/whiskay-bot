import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import config from '../../config/index.js';
import { serializeMessage } from '../../core/serializer.js';
import { registry } from '../../core/registry.js';
import { hasPremium } from '../../lib/energy-worker.js';
import { createPairingTicket, consumePairingTicket, waitForPortalUrl, getPortalMode } from '../../services/jadibotPortal.js';

const DAY = 86400000;
let DAYS = Math.max(1, Number(process.env.JADIBOT_DEFAULT_DAYS || 30));
let PRICE = Math.max(0, Number(process.env.JADIBOT_PRICE_30D || 10000));
const ROOT = path.resolve('data/jadibot');
const SETTINGS = path.join(ROOT, 'settings.json');
const DBFILE = path.join(ROOT, 'rentals.json');
const sockets = new Map();
let writes = Promise.resolve();
let settingsLoaded = false;
const idOf = jid => String(jid || '').split('@')[0].split(':')[0].replace(/[^\w-]/g, '').slice(0, 80);
const money = n => new Intl.NumberFormat('id-ID').format(Number(n) || 0);
async function loadSettings() {
  if (settingsLoaded) return;
  settingsLoaded = true;
  try {
    const x = JSON.parse(await readFile(SETTINGS, 'utf8'));
    if (Number.isInteger(x.days) && x.days >= 1 && x.days <= 365) DAYS = x.days;
    if (Number.isFinite(x.price) && x.price >= 0 && x.price <= 1e8) PRICE = x.price;
  } catch {}
}
async function saveSettings() {
  await mkdir(ROOT, { recursive: true, mode: 0o700 });
  const tmp = `${SETTINGS}.tmp`;
  await writeFile(tmp, JSON.stringify({ days: DAYS, price: PRICE, updatedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  await rename(tmp, SETTINGS);
}
async function dbRead() { try { return JSON.parse(await readFile(DBFILE, 'utf8')); } catch { return {}; } }
async function dbChange(fn) {
  const run = writes.then(async () => {
    await mkdir(ROOT, { recursive: true, mode: 0o700 });
    const db = await dbRead();
    const result = await fn(db);
    const tmp = `${DBFILE}.tmp`;
    await writeFile(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
    await rename(tmp, DBFILE);
    return result;
  });
  writes = run.catch(() => {});
  return run;
}
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
    row = { user, startedAt: Date.now(), expiresAt: Date.now() + DAYS * DAY, connected: false, phone: '', mode };
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
  sockets.set(key, sock);
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', async upsert => {
    if (upsert.type !== 'notify' || !registry.bot?._cmd) return;
    for (const raw of upsert.messages || []) {
      if (!raw.message) continue;
      try {
        const subCtx = await serializeMessage(sock, raw, config, registry.bot);
        if (!subCtx?.body) continue;
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
// Persisted expiry is enforced even when nobody calls .jadibotstatus. Use a global guard
// so plugin hot-reloads do not create multiple background workers.
if (!globalThis.__whiskayJadibotExpiryTimer) {
  globalThis.__whiskayJadibotExpiryTimer = setInterval(async () => {
    try {
      const db = await dbRead();
      const now = Date.now();
      for (const [key, row] of Object.entries(db)) {
        if (!row || !row.expiresAt || row.expiresAt > now || row.expirationHandledAt) continue;
        await stop(key, false).catch(() => {});
        await dbChange(current => {
          if (current[key] && !current[key].expirationHandledAt && current[key].expiresAt <= Date.now()) {
            current[key].connected = false;
            current[key].expirationHandledAt = Date.now();
          }
        }).catch(() => {});
        const mainSock = registry.sock || registry.bot?.sock;
        if (row.user && mainSock?.sendMessage) {
          await mainSock.sendMessage(row.user, { text: '⏳ Masa sewa WHISKAY Jadibot kamu sudah berakhir. Sesi dihentikan. Gunakan .perpanjang untuk memperpanjang, lalu .jadibotlogin untuk menghubungkan kembali.' }).catch(() => {});
        }
      }
    } catch (error) { console.warn('[jadibot] expiry worker failed:', error?.message || error); }
  }, 60_000);
  globalThis.__whiskayJadibotExpiryTimer.unref?.();
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
  async execute(ctx) {
    await loadSettings();
    const cmd = ctx.command, a = ctx.args || [], user = ctx.sender || ctx.chat, key = idOf(user);
    if (cmd === 'jadibot') {
      if (!await allowed(ctx)) return ctx.reply('💎 Fitur jadibot hanya untuk owner dan pengguna Premium aktif.');
      const mode = String(a[0] || '').toLowerCase();
      if (!mode) return ctx.sendInteractive({ title: '🤖 WHISKAY JADIBOT', subtitle: `${DAYS} hari · Rp${money(PRICE)}`, body: 'Pilih metode login. Gunakan hanya akun WhatsApp milik sendiri.', buttons: [{ name: 'quick_reply', title: '📷 QR Code', id: '.jadibot qr' }, { name: 'quick_reply', title: '🔐 Pairing Code', id: '.jadibot pairing' }, { name: 'quick_reply', title: '💳 Harga & perpanjang', id: '.perpanjang' }] });
      if (mode === 'qr' || mode === 'qrcode') return start(ctx, 'qr');
      if (mode === 'pairing' || mode === 'code') {
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
      const ref = `JB${Date.now().toString(36).toUpperCase()}`;
      await dbChange(d => { d[key] ??= { user, startedAt: Date.now(), expiresAt: 0, connected: false }; d[key].pendingPayment = { ref, days, amount, status: 'pending', createdAt: Date.now() }; });
      const pay = await paymentConfig();
      await ownersNotify(ctx, `💳 PERMINTAAN JADIBOT\nUser: ${user}\nKey: ${key}\nRef: ${ref}\nDurasi: ${days} hari\nNominal: Rp${money(amount)}\nApprove setelah dana diverifikasi: .jadibotapprove ${key}`);
      return ctx.reply(`💳 *PERPANJANGAN JADIBOT*\nRef: ${ref}\nDurasi: ${days} hari\nTotal: *Rp${money(amount)}*\n\n${methods(pay)}\n\nKirim bukti dengan .buktijadibot ${ref} sambil reply gambar. Masa aktif belum bertambah sebelum owner memverifikasi pembayaran.`);
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
      const db = await dbRead(), row = db[target];
      if (!row?.pendingPayment || row.pendingPayment.status !== 'pending') return ctx.reply('Tidak ada pembayaran pending.');
      const payment = row.pendingPayment;
      payment.status = 'approved'; payment.approvedAt = Date.now(); payment.approvedBy = key;
      row.expiresAt = Math.max(Date.now(), Number(row.expiresAt) || 0) + payment.days * DAY;
      row.startedAt = row.startedAt || Date.now();
      await dbChange(d => { d[target] = row; });
      return ctx.reply(`✅ Pembayaran ${payment.ref} disetujui. Masa aktif bertambah ${payment.days} hari, berakhir ${new Date(row.expiresAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB.`);
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

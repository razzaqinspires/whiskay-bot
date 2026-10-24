import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import config from '../../config/index.js';
import { serializeMessage } from '../../core/Serializer.js';
import { registry } from '../../core/registry.js';
import { hasPremium } from '../../lib/energy-worker.js';

const DAY = 86400000;
let DAYS = Math.max(1, Number(process.env.JADIBOT_DEFAULT_DAYS || 30));
let PRICE = Math.max(0, Number(process.env.JADIBOT_PRICE_30D || 10000));
const SETTINGS = path.resolve('data/jadibot/settings.json');
let settingsLoaded = false;
async function loadSettings() { if (settingsLoaded) return; settingsLoaded = true; try { const x=JSON.parse(await readFile(SETTINGS,'utf8')); if(Number.isInteger(x.days)&&x.days>=1&&x.days<=365) DAYS=x.days; if(Number.isFinite(x.price)&&x.price>=0&&x.price<=1e8) PRICE=x.price; } catch {} }
async function saveSettings() { await mkdir(path.dirname(SETTINGS),{recursive:true}); const tmp=SETTINGS+'.tmp'; await writeFile(tmp,JSON.stringify({days:DAYS,price:PRICE},null,2),{mode:0o600}); await rename(tmp,SETTINGS); }
const ROOT = path.resolve('data/jadibot');
const DBFILE = path.join(ROOT, 'rentals.json');
const sockets = new Map();
let writes = Promise.resolve();
const idOf = jid => String(jid || '').split('@')[0].replace(/[^\w-]/g, '').slice(0, 80);
const money = n => new Intl.NumberFormat('id-ID').format(Number(n) || 0);
async function dbRead() { try { return JSON.parse(await readFile(DBFILE, 'utf8')); } catch { return {}; } }
async function dbChange(fn) { const run = writes.then(async () => { await mkdir(ROOT, {recursive:true}); const db = await dbRead(); const result = await fn(db); const tmp = DBFILE + '.tmp'; await writeFile(tmp, JSON.stringify(db, null, 2), {mode:0o600}); await rename(tmp, DBFILE); return result; }); writes = run.catch(()=>{}); return run; }
const sessionDir = key => path.join(ROOT, 'sessions', key);
const owner = ctx => Boolean(ctx.isOwner);
async function allowed(ctx) { return owner(ctx) || await hasPremium(ctx.sender || ctx.chat).catch(()=>false); }
async function paymentConfig() { try { const m=await import('../../lib/energy-worker.js'); return await m.getPaymentConfig(); } catch { return {}; } }
function methods(p) { const out=[]; for(const k of ['bank','ewallet']) for(const x of p[k]||[]) out.push(`• ${k.toUpperCase()} ${x.name}: ${x.number} a.n. ${x.owner}`); if(p.qrisPath) out.push('• QRIS sudah dikonfigurasi; minta QR kepada owner.'); return out.join('\n') || 'Metode pembayaran belum diatur. Hubungi owner.'; }
async function stop(key, logout=false) { const sock=sockets.get(key); sockets.delete(key); if(sock) { try { logout ? await sock.logout() : sock.end(new Error('stopped')); } catch {} } if(logout) await rm(sessionDir(key),{recursive:true,force:true}).catch(()=>{}); }
async function start(ctx, mode, phone='') {
 if(!await allowed(ctx)) throw new Error('Fitur jadibot hanya untuk owner dan pengguna Premium aktif.');
 const user=ctx.sender||ctx.chat, key=idOf(user); if(!key) throw new Error('ID pengguna tidak valid.');
 const all=await dbRead(); let row=all[key];
 if(row && row.expiresAt<=Date.now()) throw new Error('Masa aktif habis. Gunakan .perpanjang.');
 if(sockets.has(key)) throw new Error('Sesi sudah berjalan. Gunakan .jadibotstatus.');
 if(!row) { row={user,startedAt:Date.now(),expiresAt:Date.now()+DAYS*DAY,connected:false,phone:'',mode}; await dbChange(d=>{d[key]=row;}); }
 await mkdir(sessionDir(key),{recursive:true});
 const {state,saveCreds}=await useMultiFileAuthState(sessionDir(key)); const {version}=await fetchLatestBaileysVersion();
 const sock=makeWASocket({version,browser:Browsers.ubuntu('Chrome'),auth:{creds:state.creds,keys:makeCacheableSignalKeyStore(state.keys,{trace(){},debug(){},info(){},warn(){},error(){}})},markOnlineOnConnect:false,syncFullHistory:false,printQRInTerminal:false,getMessage:async()=>({conversation:''})});
 sockets.set(key,sock); sock.ev.on('creds.update',saveCreds);
 sock.ev.on('messages.upsert', async upsert => { if(upsert.type!=='notify'||!registry.bot?._cmd) return; for(const raw of upsert.messages||[]) { if(!raw.message) continue; try { const ctx=await serializeMessage(sock,raw,config,registry.bot); if(!ctx?.body) continue; const body=String(ctx.body).trim(); if(!/^[.,!/#]/.test(body)) continue; await registry.bot._cmd.handle(ctx); } catch {} } });
 sock.ev.on('connection.update',async u=>{
  if(u.qr && mode==='qr') { try{qrcode.generate(u.qr,{small:true});}catch{}; await ctx.reply('📷 QR login tampil di terminal server. Scan segera dari WhatsApp > Perangkat tertaut. QR tidak dikirim ke layanan pihak ketiga.'); }
  if(u.connection==='open') { const number=String(sock.user?.id||'').split(':')[0].split('@')[0]; await dbChange(d=>{if(d[key]){d[key].connected=true;d[key].phone=number;d[key].lastConnectedAt=Date.now();}}).catch(()=>{}); await ctx.reply(`✅ Sub-bot terhubung: ${number}. Sesi disimpan secara terpisah.`).catch(()=>{}); }
  if(u.connection==='close') { sockets.delete(key); const code=new Boom(u.lastDisconnect?.error)?.output?.statusCode; await dbChange(d=>{if(d[key])d[key].connected=false;}).catch(()=>{}); if(code===DisconnectReason.loggedOut) await ctx.reply('⚠️ Akun sub-bot logout/unlink. Jalankan .jadibot untuk login ulang.').catch(()=>{}); }
 });
 if(mode==='pairing'&&!state.creds.registered) { const n=String(phone).replace(/\D/g,''); if(n.length<8||n.length>15){await stop(key);throw new Error('Format nomor: 628xxxxxxxxxx');} setTimeout(async()=>{try{const code=await sock.requestPairingCode(n);await ctx.reply(`🔐 *PAIRING CODE*\n\n*${code.match(/.{1,4}/g)?.join('-')||code}*\n\nWhatsApp > Perangkat tertaut > Tautkan perangkat > Tautkan dengan nomor telepon.`);}catch(e){await ctx.reply('Gagal membuat pairing code: '+e.message).catch(()=>{});}},1800); }
}
function status(row) { if(!row)return 'Belum ada sesi jadibot.'; const left=Math.max(0,row.expiresAt-Date.now()); return `🤖 *STATUS JADIBOT*\nStatus: ${left?(row.connected?'🟢 Terhubung':'🟡 Sesi tersimpan'):'🔴 Kedaluwarsa'}\nNomor: ${row.phone||'-'}\nMasa aktif sampai: ${new Date(row.expiresAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} WIB\nSisa: ${Math.ceil(left/DAY)} hari\nHarga ${DAYS} hari: Rp${money(PRICE)}`; }
async function ownersNotify(ctx, text) { for(const jid of config.owners||[]) try { await ctx.sock.sendMessage(jid,{text}); } catch {} }
export default {
 name:'jadibot', command:['jadibot','jadibotstatus','jadibotlogin','jadibotlogout','perpanjang','buktijadibot','listjadibot','jadibotapprove','stopjadibot','setjadibotharga','setjadibotdurasi','setjadibotpay','setjadibotpremium'], menuCommands:['jadibot','jadibotstatus','jadibotlogin','jadibotlogout','perpanjang'], category:'premium', description:'Sewa sub-bot QR/pairing, status, perpanjangan dan kontrol owner', cooldown:2500,
 async execute(ctx) {
  await loadSettings();
  const cmd=ctx.command, a=ctx.args||[], user=ctx.sender||ctx.chat, key=idOf(user);
  if(cmd==='jadibot') { const mode=String(a[0]||'').toLowerCase(); if(!mode)return ctx.sendInteractive({title:'🤖 WHISKAY JADIBOT',subtitle:`${DAYS} hari · Rp${money(PRICE)}`,body:'Pilih metode login. Gunakan hanya akun WhatsApp milik sendiri.',buttons:[{name:'quick_reply',title:'📷 QR Code',id:'.jadibot qr'},{name:'quick_reply',title:'🔐 Pairing Code',id:'.jadibot pairing'},{name:'quick_reply',title:'💳 Harga & perpanjang',id:'.perpanjang'}]}); if(mode==='qr'||mode==='qrcode')return start(ctx,'qr'); if(mode==='pairing'||mode==='code') {if(!a[1])return ctx.reply('Format: .jadibot pairing 628xxxxxxxxxx');return start(ctx,'pairing',a[1]);} return ctx.reply('Gunakan .jadibot qr atau .jadibot pairing 628xxxxxxxxxx.'); }
  if(cmd==='jadibotstatus')return ctx.reply(status((await dbRead())[key]));
  if(cmd==='jadibotlogin') {const row=(await dbRead())[key];if(!row||row.expiresAt<=Date.now())return ctx.reply('Sesi tidak ada atau sudah habis. Gunakan .perpanjang.');return start(ctx,row.mode||'qr');}
  if(cmd==='jadibotlogout') {await stop(key,true);await dbChange(d=>{if(d[key])d[key].connected=false;});return ctx.reply('✅ Sesi logout dan kredensial lokal dihapus. Masa sewa tetap berjalan.');}
  if(cmd==='perpanjang') {const days=Math.max(1,Math.min(365,Number(a[0]||DAYS)||DAYS));const amount=Math.round(PRICE*days/DAYS),ref='JB'+Date.now().toString(36).toUpperCase();await dbChange(d=>{d[key]??={user,startedAt:Date.now(),expiresAt:0,connected:false};d[key].pendingPayment={ref,days,amount,status:'pending',createdAt:Date.now()};});const pay=await paymentConfig();await ownersNotify(ctx,`💳 PERMINTAAN JADIBOT\nUser: ${user}\nKey: ${key}\nRef: ${ref}\nDurasi: ${days} hari\nNominal: Rp${money(amount)}\nApprove setelah dana diverifikasi: .jadibotapprove ${key}`);return ctx.reply(`💳 *PERPANJANGAN JADIBOT*\nRef: ${ref}\nDurasi: ${days} hari\nTotal: *Rp${money(amount)}*\n\n${methods(pay)}\n\nKirim bukti dengan .buktijadibot ${ref} sambil reply gambar. Masa aktif belum bertambah sebelum owner memverifikasi pembayaran.`);}
  if(cmd==='buktijadibot') {const ref=String(a[0]||''),row=(await dbRead())[key];if(!ref||row?.pendingPayment?.ref!==ref||row.pendingPayment.status!=='pending')return ctx.reply('Referensi tidak valid. Gunakan .perpanjang untuk membuat permintaan.');let media=null;if(ctx.quoted)media=await ctx.download(ctx.quoted).catch(()=>null);for(const jid of config.owners||[])try{if(media)await ctx.sock.sendMessage(jid,{image:media,caption:`Bukti pembayaran jadibot\nUser: ${user}\nRef: ${ref}\nNominal: Rp${money(row.pendingPayment.amount)}\nVerifikasi dana secara manual.`});await ctx.sock.sendMessage(jid,{text:`Approve jika dana masuk: .jadibotapprove ${key}`});}catch{}return ctx.reply('Bukti diteruskan ke owner jika gambar dilampirkan. Tunggu verifikasi manual.');}
  if(cmd==='listjadibot') {if(!owner(ctx))return ctx.reply('Owner only.');const db=await dbRead();return ctx.reply('📋 *JADIBOT*\n'+(Object.entries(db).map(([k,r])=>`${k} | ${r.phone||'-'} | ${r.connected?'online':'offline'} | ${Math.ceil(Math.max(0,r.expiresAt-Date.now())/DAY)} hari`).join('\n')||'Kosong'));}
  if(cmd==='jadibotapprove') {if(!owner(ctx))return ctx.reply('Owner only.');const target=idOf(a[0]);const db=await dbRead(),row=db[target];if(!row?.pendingPayment||row.pendingPayment.status!=='pending')return ctx.reply('Tidak ada pembayaran pending.');const p=row.pendingPayment;row.pendingPayment.status='approved';row.expiresAt=Math.max(Date.now(),Number(row.expiresAt)||0)+p.days*DAY;row.startedAt=row.startedAt||Date.now();await dbChange(d=>{d[target]=row;});return ctx.reply(`✅ Pembayaran ${p.ref} disetujui. Masa aktif bertambah ${p.days} hari, berakhir ${new Date(row.expiresAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} WIB.`);}
  if(cmd==='stopjadibot') {if(!owner(ctx))return ctx.reply('Owner only. Format: .stopjadibot USERKEY');const target=idOf(a[0]);if(!target)return ctx.reply('Format: .stopjadibot USERKEY');await stop(target,true);await dbChange(d=>{if(d[target])d[target].connected=false;});return ctx.reply(`Sesi ${target} dihentikan.`);}
  if(cmd==='setjadibotharga') {if(!owner(ctx))return ctx.reply('Owner only.');const n=Number(a[0]);if(!Number.isFinite(n)||n<0||n>1e8)return ctx.reply('Format: .setjadibotharga 15000');PRICE=Math.floor(n); await saveSettings(); return ctx.reply(`✅ Harga jadibot disimpan: Rp${money(PRICE)} per ${DAYS} hari. Perubahan langsung aktif.`);}
  if(cmd==='setjadibotdurasi') {if(!owner(ctx))return ctx.reply('Owner only.');const n=Number(a[0]);if(!Number.isInteger(n)||n<1||n>365)return ctx.reply('Format: .setjadibotdurasi 30');DAYS=n; await saveSettings(); return ctx.reply(`✅ Durasi default disimpan: ${DAYS} hari. Perubahan langsung aktif.`);}
  if(cmd==='setjadibotpay')return owner(ctx)?ctx.reply('Gunakan command yang sudah tersedia: .setpayment bank Nama|Nomor|Pemilik, .setpayment ewallet Nama|Nomor|Pemilik, atau .setpayment qris.'):ctx.reply('Owner only.');
  if(cmd==='setjadibotpremium')return owner(ctx)?ctx.reply('Gunakan .premium @user 30 untuk mengatur premium; jadibot memeriksa status premium yang sama.'):ctx.reply('Owner only.');
 }
};

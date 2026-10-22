import os from 'node:os';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { getEnergy, chargeEnergy, getHits, getRuntimeSwitches, setRuntimeSwitch, getPaymentConfig, setPaymentConfig, grantPremium, getPremiumPrice } from '../../lib/energy-worker.js';

const DAY = 86400000;
const ownerTargets = configOwners();
function configOwners(){ try { return (process.env.OWNERS||'').split(',').map(x=>x.trim()).filter(Boolean).map(x=>x.includes('@')?x:`${x.replace(/\D/g,'')}@s.whatsapp.net`); } catch { return []; } }
const money = n => new Intl.NumberFormat('id-ID').format(Math.max(0,Number(n)||0));
const isPremium = e => Number(e.premiumUntil||0)>Date.now();
const premiumLeft = e => isPremium(e) ? Math.max(0,Math.ceil((e.premiumUntil-Date.now())/DAY)) : 0;
async function runtimeInfo(){const m=process.memoryUsage();return {rss:Math.round(m.rss/1048576),heap:Math.round(m.heapUsed/1048576),node:process.versions.node,platform:`${os.platform()} ${os.arch()}`,cpus:os.cpus().length,load:(os.loadavg()[0]||0).toFixed(2)};}
async function readPayment(){return getPaymentConfig();}
async function getQuotedMedia(ctx){if(!ctx.quoted)return null;try{const buffer=await ctx.download(ctx.quoted);return buffer?.length?buffer:null;}catch{return null;}}
export default {
 name:'energy-system', command:['charge','hit','setpayment','bukti','status','premium'], menuCommands:['charge','hit','setpayment','bukti','status','premium'], category:'system', cooldown:1200,
 description:'Smart Energy, dashboard hit, premium, pembayaran dan status worker', energyMode:'static', energyCost:0.35,
 async execute(ctx){
  const [a='',b='',c='']=(ctx.args||[]); const action=String(a).toLowerCase(); const uid=ctx.sender||ctx.chat;
  if(ctx.command==='charge'){
   const fast=String(action)==='fast'; const result=await chargeEnergy(uid,Date.now(),fast);
   if(!result.ok){if(result.reason==='fast-premium-only')return ctx.reply('⚡ Fast charging hanya tersedia untuk Premium aktif.');return ctx.reply(`🔋 Charge reguler hanya bisa sekali setiap 24 jam. Coba lagi ${new Date(result.nextAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} WIB. Energi sekarang ${result.energy.toFixed(2)}%.`);}
   if(ctx.energyReceipt)ctx.energyReceipt.energy=result.energy;
   return ctx.reply(`🔋 *CHARGING SELESAI*\nEnergi sekarang: ${result.energy.toFixed(2)}%\n${fast?'Fast charge Premium: baterai diisi hingga 100%.':'Charge harian: +40% energi.'}`);
  }
  if(ctx.command==='hit'){
   const all=await getHits(), top=Object.entries(all.commands||{}).sort((x,y)=>y[1]-x[1]).slice(0,8), user=(all.users||{})[uid]||{total:0,commands:{}};
   const personal=Object.entries(user.commands||{}).sort((x,y)=>y[1]-x[1]).slice(0,5);
   return ctx.reply(`📊 *WHISKAY HIT DASHBOARD*\nTotal hit global: ${all.total||0}\nHit akunmu: ${user.total||0}\n\n🏆 *Top Command*\n${top.map(([k,v],i)=>`${i+1}. ${ctx.prefix}${k} — ${v}`).join('\n')||'Belum ada data'}\n\n👤 *Command Kamu*\n${personal.map(([k,v])=>`• ${ctx.prefix}${k}: ${v}`).join('\n')||'Belum ada hit pribadi'}`);
  }
  if(ctx.command==='setpayment'){
   if(!ctx.isOwner)return ctx.reply('🔒 Khusus owner. Format: .setpayment bank Nama|Nomor|Pemilik, .setpayment ewallet Nama|Nomor|Pemilik, atau .setpayment qris <path-file>');
   const rest=(ctx.args||[]).slice(1).join(' ').trim();
   if(!action||(!rest&&action!=='qris'))return ctx.reply('💳 *PAYMENT CONFIG*\n.setpayment bank Nama Bank|Nomor Rekening|Nama Pemilik\n.setpayment ewallet Nama|Nomor|Pemilik\n.setpayment qris ./data/qris.png\n.setpayment price 1000\n.setpayment rate 1.01');
   const config=await readPayment();
   if(action==='bank'||action==='ewallet') {const fields=rest.split('|').map(s=>s.trim());if(fields.length<3)return ctx.reply('Format wajib: Nama|Nomor|Nama Pemilik');const item={name:fields[0].slice(0,80),number:fields[1].slice(0,80),owner:fields[2].slice(0,100)};config[action]=[...(config[action]||[]).filter(x=>x.name!==item.name),item].slice(-10);await setPaymentConfig(config);return ctx.reply(`✅ Metode ${action} tersimpan.`);}
   if(action==='qris'){let dest='';if(rest){dest=path.resolve(rest);if(!dest.startsWith(path.resolve('data')+path.sep))return ctx.reply('File QRIS harus berada di dalam folder data/.');try{const fs=await readFile(dest);if(fs.length>5*1024*1024)return ctx.reply('QRIS maksimal 5 MB.');}catch{return ctx.reply('File QRIS tidak ditemukan.');}}else{const quoted=ctx.quoted;const mime=String(ctx.media?.type||'');if(mime!=='imageMessage'&&!quoted)return ctx.reply('Reply gambar QRIS lalu kirim .setpayment qris, atau gunakan path file di data/.');const buffer=await ctx.download(quoted||ctx.raw).catch(()=>null);if(!buffer?.length||buffer.length>5*1024*1024)return ctx.reply('Gagal membaca QRIS atau ukuran melebihi 5 MB.');dest=path.resolve('data/payment/qris.png');await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,buffer);}config.qrisPath=dest;await setPaymentConfig(config);return ctx.reply('✅ QRIS disimpan. Pastikan file tetap tersedia di server.');}
   if(action==='rate'){const rate=Number(rest);if(!Number.isFinite(rate)||rate<0.8||rate>1.2)return ctx.reply('Rate harian harus 0,80–1,20. Contoh .setpayment rate 1.01');config.dailyRate=rate;config.priceEpoch=Date.now();await setPaymentConfig(config);return ctx.reply(`✅ Rate harga harian disetel ${rate}. Epoch harga direset ke hari ini.`);}
   if(action==='price'){const price=Number(rest);if(!Number.isFinite(price)||price<1||price>100000000)return ctx.reply('Harga per hari harus 1–100.000.000.');config.basePrice=Math.floor(price);config.priceEpoch=Date.now();await setPaymentConfig(config);return ctx.reply(`✅ Harga dasar premium: Rp${money(price)}/hari. Rate saat ini: ${config.dailyRate||1.01}. Harga akan menyesuaikan harian.`);}
   return ctx.reply('Opsi: bank, ewallet, qris, price.');
  }
  if(ctx.command==='bukti'){
   const media=await getQuotedMedia(ctx);if(!media)return ctx.reply('Balas/reply gambar bukti transfer dengan command .bukti.');
   if(!ctx.isGroup && ctx.isOwner)return ctx.reply('Kirim bukti dari akun pelanggan, bukan owner.');
   const owners=ownerTargets; if(!owners.length)return ctx.reply('Owner belum dikonfigurasi di OWNERS pada .env.');
   let sent=0;for(const owner of owners){try{let forwarded=false;if(ctx.quoted){try{await ctx.sock.sendMessage(owner,{forward:ctx.quoted,force:true});forwarded=true;}catch{}}if(!forwarded)await ctx.sock.sendMessage(owner,{image:media,caption:'🧾 BUKTI PEMBAYARAN PREMIUM (salinan media)'});await ctx.sock.sendMessage(owner,{text:`🧾 *BUKTI PEMBAYARAN PREMIUM*\nPengirim: ${ctx.pushName||'User'}\nID: ${ctx.sender}\nChat asal: ${ctx.chat}\nWaktu: ${new Date().toISOString()}\nPeriksa bukti secara manual sebelum mengaktifkan Premium.`});sent++;}catch{}}
   return ctx.reply(sent?`✅ Bukti diteruskan ke ${sent} owner untuk verifikasi manual. Premium belum aktif sampai pembayaran diperiksa.`:'❌ Gagal meneruskan bukti ke owner.');
  }
  if(ctx.command==='premium'){
   if(!ctx.isOwner)return ctx.reply('🔒 Hanya owner yang dapat mengaktifkan Premium.');
   const target=ctx.mentions?.[0]||String(b||'');const days=Number(c||b||30);if(!target||!target.includes('@'))return ctx.reply('Format: .premium @user 30 (maksimal 30 hari per pemberian).');
   const until=await grantPremium(target,days);return ctx.reply(`✅ Premium diaktifkan untuk ${target.split('@')[0]} sampai ${new Date(until).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} WIB. Maksimal 30 hari per pemberian.`);
  }
  if(ctx.command==='status'){
   if(action==='antispam'||action==='cooldown'){
    if(!ctx.isOwner)return ctx.reply('🔒 Saklar runtime hanya untuk owner.');if(!['on','off'].includes(String(b).toLowerCase()))return ctx.reply(`Format: .status ${action} on|off`);
    const key=action==='antispam'?'antiSpam':'globalCooldown';const next=await setRuntimeSwitch(key,b.toLowerCase()==='on');return ctx.reply(`⚙️ ${key}: ${next[key]?'ON':'OFF'}`);
   }
   const sw=await getRuntimeSwitches(),rt=await runtimeInfo(),e=await getEnergy(uid),premiumPrice=await getPremiumPrice();
   if(!ctx.isOwner)return ctx.reply(`WHISKAYBOT: operational\nEnergi kamu: ${e.energy.toFixed(2)}%\nPremium: ${isPremium(e)?`${premiumLeft(e)} hari tersisa`:'Tidak aktif'}\nGunakan .charge untuk mengisi energi.`);
   return ctx.reply(`🧠 *WHISKAY DEVELOPER STATUS*\nAnti-Spam: ${sw.antiSpam?'ON':'OFF'}\nGlobal Cooldown: ${sw.globalCooldown?'ON':'OFF'}\nEnergy Worker: bounded inline worker\nEnergy: ${e.energy.toFixed(2)}%\nPremium: ${isPremium(e)?`${premiumLeft(e)} hari tersisa`:'Tidak aktif'}\nHarga Premium hari ini: Rp${money(premiumPrice)}\n\n🖥️ Hardware/runtime\nPlatform: ${rt.platform}\nNode: ${rt.node}\nCPU logical: ${rt.cpus}\nLoad average: ${rt.load}\nRSS: ${rt.rss} MB\nHeap: ${rt.heap} MB\n\nSaklar owner:\n.status antispam on|off\n.status cooldown on|off`);
  }
 }
};

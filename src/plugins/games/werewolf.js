import { createRoom, getWerewolfRoom, joinRoom, leaveRoom, startRoom, voteRoom, nightAction, resolveNight, resolveDay, deleteRoom } from '../../lib/werewolf-store.js';

const ROLE_LABELS = { werewolf:'Werewolf 🐺', villager:'Warga 👨‍🌾', seer:'Seer 🔮', guardian:'Guardian 🛡️', witch:'Witch 🧙', hunter:'Hunter 🏹', sorcerer:'Sorcerer 🪄', traitor:'Traitor 🕵️', lycan:'Lycan 🐺' };
const n = value => String(value || '').trim();
const targetFrom = ctx => ctx.mentions?.[0] || ctx.mentionedJid?.[0] || '';
const options = (ctx, sub, rows=[]) => ({ title:'🐺 WHISKAY WEREWOLF', subtitle:'Permainan deduksi sosial', body:`Perintah: ${ctx.prefix}ww ${sub}\nPemain: ${rows.filter(x=>x.alive).length}/${rows.length}`, buttons:[{name:'quick_reply',title:'Daftar Pemain',id:`${ctx.prefix}ww player`},{name:'quick_reply',title:'Panduan',id:`${ctx.prefix}ww guide`},{name:'quick_reply',title:'Refresh',id:`${ctx.prefix}ww status`}] });

export default {
 name:'werewolf', command:['ww','werewolf'], category:'games', cooldown:1000, group:true,
 description:'Werewolf multiplayer: room, join, roles, siang/malam, voting dan skill pribadi',
 async execute(ctx) {
   const sub=n(ctx.args?.[0]).toLowerCase() || 'help'; const sender=ctx.sender; const chat=ctx.chat;
   if(!ctx.isGroup) return ctx.reply('🐺 Werewolf hanya dimainkan di grup.');
   try {
     if(sub==='create') { const r=await createRoom(chat,sender); return ctx.sendInteractive({title:'🐺 Room Werewolf dibuat',subtitle:`Room ${r.id}`,body:'Minimal 5 pemain, maksimal 15. Pemain bergabung sebelum pemilik room memulai game.',buttons:[{name:'quick_reply',title:'Gabung',id:`${ctx.prefix}ww join`},{name:'quick_reply',title:'Panduan',id:`${ctx.prefix}ww guide`}]}); }
     if(sub==='join') { const r=await joinRoom(chat,sender,ctx.pushName); return ctx.sendInteractive({title:'✅ Bergabung ke Werewolf',body:`Room ${r.id}\nPemain: ${r.players.length}/15\nPemilik room dapat mulai dengan ${ctx.prefix}ww start.`,buttons:[{name:'quick_reply',title:'Daftar Pemain',id:`${ctx.prefix}ww player`},{name:'quick_reply',title:'Panduan',id:`${ctx.prefix}ww guide`}]}); }
     if(sub==='left'||sub==='leave') { const r=await leaveRoom(chat,sender); return ctx.reply(`Kamu keluar dari room. Sisa pemain: ${r.players.length}.`); }
     if(sub==='start') {
       const result=await startRoom(chat,sender);
       const sendRole=async (p)=>{try{await ctx.sock.sendMessage(p.id,{text:`🐺 WHISKAY WEREWOLF\nRole kamu: *${ROLE_LABELS[p.role]||p.role}*\nRoom: ${result.public.id}\nRonde: ${result.public.round}\n\nGunakan skill melalui chat pribadi: .wwpc <skill> <nomor pemain>. Room: ${result.public.id}. Ikuti fase room untuk aksi yang legal.`});return true;}catch{return false;}};
       const rolesSent=[];for(const p of result.privateRoles)rolesSent.push({id:p.id,sent:await sendRole(p)});
       const mentionList=result.public.players.map(p=>p.id);
       await ctx.sock.sendMessage(chat,{text:`🐺 *WEREWOLF DIMULAI*\nRoom: ${result.public.id}\nRonde ${result.public.round} · fase MALAM\nRole dikirim lewat chat pribadi. Jika DM gagal, pemain perlu mengaktifkan pesan dari bot.\nPemain: ${result.public.players.map(p=>`${p.number}. @${p.id.split('@')[0]}`).join('\n')}`,mentions:mentionList},{quoted:ctx.raw});
       return ctx.reply(`Role dibagikan. DM berhasil: ${rolesSent.filter(x=>x.sent).length}/${rolesSent.length}. Gunakan .ww status untuk melihat fase.`);
     }
     if(sub==='status'||sub==='player'||sub==='players') {
       const r=await getWerewolfRoom(chat);if(!r)return ctx.reply('Belum ada room. Gunakan .ww create.');
       const rows=r.players.map(p=>`${p.number}. ${p.alive?'🟢':'☠️'} @${p.id.split('@')[0]}${p.mayor?' 👑':''}${p.alive?'':` (${ROLE_LABELS[p.role]||p.role})`}`).join('\n')||'Belum ada pemain.';
       return ctx.sendInteractive({title:'🐺 WEREWOLF · ROOM',subtitle:`${r.id} · ${r.status} · fase ${r.phase}`,body:`Pemain (${r.players.length}/15):\n${rows}\n\nRonde: ${r.round}${r.winner?`\nPemenang: ${r.winner}`:''}`,buttons:[{name:'quick_reply',title:'Gabung',id:`${ctx.prefix}ww join`},{name:'quick_reply',title:'Mulai',id:`${ctx.prefix}ww start`},{name:'quick_reply',title:'Refresh',id:`${ctx.prefix}ww status`}]});
     }
     if(sub==='vote') {
       const targetNumber=n(ctx.args?.[1]); if(!/^\d+$/.test(targetNumber))return ctx.reply('Format: .ww vote nomor_pemain');
       const r=await getWerewolfRoom(chat);const target=r?.players.find(p=>p.number===Number(targetNumber))?.id;if(!target)return ctx.reply('Nomor pemain tidak ditemukan.');
       const result=await voteRoom(chat,sender,target);return ctx.reply(`Vote tersimpan. Rekap suara: ${JSON.stringify(result.tally.tally)}. Owner room dapat mengakhiri fase melalui .ww resolve-day.`);
     }
     if(sub==='resolve-night'||sub==='resolve-day') {
       const r=await getWerewolfRoom(chat);if(!r)return ctx.reply('Room tidak ditemukan.');if(r.owner!==sender&&!ctx.isOwner&&!ctx.isAdmin)return ctx.reply('Hanya pembuat room, admin grup, atau owner yang dapat menyelesaikan fase.');
       const out=sub==='resolve-night'?await resolveNight(chat):await resolveDay(chat);return ctx.sendInteractive({title:sub==='resolve-night'?'🌅 Fase Malam Selesai':'🌙 Voting Siang Selesai',body:`${out.winner?`Pemenang: ${out.winner}`:out.room.phase==='day'?'Fase siang dimulai.':'Fase malam dimulai.'}\n${out.deaths?`Tewas: ${out.deaths.map(id=>'@'+id.split('@')[0]).join(', ')||'Tidak ada'}`:''}${out.eliminated?`\nDieksekusi: @${out.eliminated.split('@')[0]}`:''}${out.tie?'\nSuara seri; tidak ada eksekusi.':''}`,buttons:[{name:'quick_reply',title:'Status',id:`${ctx.prefix}ww status`},{name:'quick_reply',title:'Pemain',id:`${ctx.prefix}ww player`}]});
     }
     if(sub==='delete') { await deleteRoom(chat,sender,ctx.isOwner);return ctx.reply('Room Werewolf dihapus.'); }
     if(sub==='guide'||sub==='help') return ctx.sendInteractive({title:'📖 Panduan Werewolf',body:'1. .ww create — buat room grup\n2. .ww join — gabung ke room\n3. .ww start — mulai (minimal 5, maksimal 15 pemain)\n4. .ww player — status pemain\n5. .ww vote nomor — voting saat siang\n6. .ww resolve-day — pembuat room/admin mengunci voting\n7. .ww resolve-night — pembuat room/admin menyelesaikan malam\n8. .ww left — keluar dari lobby\n9. .ww delete — hapus room oleh pembuat/owner\n\nAksi pribadi: .wwpc kill nomor, .wwpc inspect nomor, .wwpc protect nomor, .wwpc heal nomor, .wwpc poison nomor. Role yang tersedia: Werewolf, Warga, Seer, Guardian, Witch, Hunter, Sorcerer, Traitor dan Lycan. Fase malam tidak otomatis berakhir; host perlu menjalankan resolve-night saat aksi selesai.',buttons:[{name:'quick_reply',title:'Buat Room',id:`${ctx.prefix}ww create`},{name:'quick_reply',title:'Gabung',id:`${ctx.prefix}ww join`}]});
     return ctx.reply(`Perintah Werewolf tidak dikenal. Gunakan ${ctx.prefix}ww guide.`);
   } catch(error) { return ctx.reply(`🐺 Werewolf: ${String(error?.message||error).slice(0,220)}`); }
 }
};

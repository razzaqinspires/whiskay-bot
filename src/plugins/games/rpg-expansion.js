import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { syncDashboardPlayer, dashboardUrl } from '../../services/dungeonWebsiteSync.js';
import { rollGacha } from '../../lib/gacha-engine.js';

const FILE = path.resolve('data/rpg-expansion.json');
const slots = new Set(['weapon', 'armor', 'accessory']);
const defaults = () => ({
  inventory: [
    { id:'potion-small', name:'Small Potion', type:'consumable', slot:'consumable', quantity:3, heal:35 },
    { id:'iron-sword', name:'Iron Sword', type:'equipment', slot:'weapon', power:8, equipped:false },
    { id:'traveler-coat', name:'Traveler Coat', type:'equipment', slot:'armor', defense:4, equipped:false },
    { id:'wind-charm', name:'Wind Charm', type:'equipment', slot:'accessory', bonus:'dodge', equipped:false },
    { id:'focus-tonic', name:'Focus Tonic', type:'consumable', slot:'consumable', quantity:1, buff:'focus', durationMinutes:10 }
  ],
  buffs:[], mode:'hub', floor:1, clearedFloors:[], dungeonSession:null,
  adventure:{checkpoint:'Aetheria Gate',weather:'Cerah',season:'Spring',x:0,z:0},
  guild:null, quest:{title:'Langkah Pertama',progress:0,target:3,complete:false}, updatedAt:Date.now()
});
const keyOf = c => `${String(c.chat||'')}|${String(c.sender||'')}`;
async function readAll(){try{return JSON.parse(await readFile(FILE,'utf8'))||{};}catch{return {};}}
async function writeAll(d){await mkdir(path.dirname(FILE),{recursive:true});const t=FILE+'.tmp';await writeFile(t,JSON.stringify(d,null,2));await rename(t,FILE);}
async function load(ctx){const all=await readAll(),key=keyOf(ctx),p={...defaults(),...(all[key]||{})};p.inventory=Array.isArray(p.inventory)?p.inventory:defaults().inventory;p.buffs=(p.buffs||[]).filter(b=>b.expiresAt>Date.now());return {all,key,p};}
async function save(ctx,all,key,p){p.updatedAt=Date.now();all[key]=p;await writeAll(all);void syncDashboardPlayer(ctx.chat,ctx.sender,{name:ctx.pushName||'Adventurer',mode:p.mode,floor:p.floor,clearedFloors:p.clearedFloors,inventory:p.inventory,buffs:p.buffs,guild:p.guild,quest:p.quest,adventure:p.adventure,gems:p.gems,spiritShards:p.spiritShards,gacha:p.gacha,updatedAt:p.updatedAt});}
const btn=(title,command)=>({name:'quick_reply',title,id:`${command}`});
function send(ctx,title,body,buttons=[]){return ctx.sendInteractive({title,subtitle:'AETHERIA · Whiskay RPG',body,footer:'Progres disimpan di server bot.',buttons:buttons.slice(0,3).map(b=>({...b,id:`${ctx.prefix}${b.id}`}))});}
function inventory(p){return p.inventory.map(i=>`• ${i.name}${i.quantity!=null?` ×${i.quantity}`:''}${i.equipped?' · EQUIPPED':''}${i.power?` · ATK +${i.power}`:i.defense?` · DEF +${i.defense}`:i.heal?` · Heal ${i.heal} HP`:''}\n  ID: ${i.id} | slot: ${i.slot}`).join('\n')||'Inventori kosong.';}
function web(ctx,path){return dashboardUrl(ctx.chat,ctx.sender,path);}
export default {
 name:'rpg-expansion',
 command:['inventory','inv','equip','unequip','use','usepotion','buff','guild','quest','weather','map','dungeon','adventure','gacha','summon','wish'],
 menuCommands:['inventory','dungeon','adventure','guild'],category:'games',
 description:'Inventory, equipment, potion, gacha summon, spirit collection, dungeon, adventure, guild, quest, weather, map',
 cooldown:1000,
 async execute(ctx){
  const root=String(ctx.command||'').toLowerCase(),a=(ctx.args||[]).map(String),sub=(a[0]||'').toLowerCase();
  const {all,key,p}=await load(ctx);
  if(root==='inventory'||root==='inv'){
   return send(ctx,'INVENTORY',`${inventory(p)}\n\nPortal: ${web(ctx,'/inventory')}`,[btn('Buka Web Inventory','inventory'),btn('Profil RPG','rpg status')]);
  }
  if(root==='equip'){
   const slot=sub,id=a.slice(1).join(' ').toLowerCase();
   if(!slots.has(slot)||!id)return send(ctx,'EQUIP','Format: equip <weapon|armor|accessory> <id>. Lihat ID dengan inventory.');
   const item=p.inventory.find(i=>i.type==='equipment'&&(i.id.toLowerCase()===id||i.name.toLowerCase()===a.slice(1).join(' ').toLowerCase()));
   if(!item||item.slot!==slot)return send(ctx,'ITEM TIDAK COCOK',`Tidak ada item yang cocok untuk slot ${slot}.`);
   for(const i of p.inventory)if(i.slot===slot)i.equipped=false;item.equipped=true;await save(ctx,all,key,p);
   return send(ctx,'EQUIPPED',`${item.name} dipasang pada slot ${slot}.\n\n${inventory(p)}`);
  }
  if(root==='unequip'){
   if(!slots.has(sub))return send(ctx,'UNEQUIP','Format: unequip <weapon|armor|accessory>');
   const i=p.inventory.find(x=>x.slot===sub&&x.equipped);if(!i)return send(ctx,'SLOT KOSONG',`Slot ${sub} tidak memiliki equipment.`);
   i.equipped=false;await save(ctx,all,key,p);return send(ctx,'UNEQUIPPED',`${i.name} dilepas.`);
  }
  if(root==='use'||root==='usepotion'){
   if(root==='use'&&sub!=='potion'&&sub!=='item')return send(ctx,'USE ITEM','Format: use potion [id|nomor]. Contoh: use potion atau use potion 1.');
   const q=(root==='usepotion'?a.join(' '):a.slice(1).join(' ')).toLowerCase();
   const consumables=p.inventory.filter(x=>x.type==='consumable'&&Number(x.quantity)>0);
   const numeric=Number(q);
   const i=p.inventory.find(x=>x.type==='consumable'&&(q?x.id.toLowerCase()===q||x.name.toLowerCase()===q:Boolean(x.heal||x.buff))&&Number(x.quantity)>0) || (Number.isInteger(numeric)&&numeric>0?consumables[numeric-1]:null);
   if(!i)return send(ctx,'POTION HABIS','Tidak ada consumable yang cocok di inventory.');
   i.quantity--;
   if(i.heal){p.adventure.hp=Math.min(Number(p.adventure.maxHp||100),Number(p.adventure.hp||65)+i.heal);await save(ctx,all,key,p);return send(ctx,'POTION USED',`${i.name} memulihkan hingga ${i.heal} HP. Sisa: ${i.quantity}`);}
   if(i.buff){p.buffs.push({id:i.buff,name:i.name,expiresAt:Date.now()+Number(i.durationMinutes||5)*60000});await save(ctx,all,key,p);return send(ctx,'BUFF AKTIF',`${i.name} aktif selama ${i.durationMinutes||5} menit.`);}
  }
  if(root==='gacha'||root==='summon'||root==='wish'){
   p.gacha=p.gacha&&typeof p.gacha==='object'?p.gacha:{pity:0,totalPulls:0,history:[],lastDailyAt:0};
   p.gems=Number.isFinite(Number(p.gems))?Math.max(0,Number(p.gems)):120;
   const action=(root==='gacha'?sub:(a[0]||'summon').toLowerCase());
   if(action==='daily'){const last=Number(p.gacha.lastDailyAt||0),remaining=86400000-(Date.now()-last);if(remaining>0)return send(ctx,'DAILY AETHER GIFT',`Hadiah harian sudah diklaim. Coba lagi dalam ${Math.ceil(remaining/3600000)} jam.
Saldo: ${p.gems} gems.`,[btn('Lihat Banner','gacha rates')]);p.gems+=40;p.gacha.lastDailyAt=Date.now();await save(ctx,all,key,p);return send(ctx,'DAILY AETHER GIFT','Kamu mendapatkan +40 Aether Gems. Hadiah berikutnya tersedia dalam 24 jam.',[btn('Summon ×1','gacha summon 1'),btn('Summon ×10','gacha summon 10'),btn('Banner & Rates','gacha rates')]);}
   if(['rates','rate','info','banner'].includes(action))return send(ctx,'AETHERIA SUMMON BANNER',`Banner: Echoes of the First Spirit
SSR Mythic: 3% · SR: 17% · R: 80%
Hard pity: SSR dijamin pada 50 pull sejak SSR terakhir.
Biaya: 30 gems / pull · 270 gems / 10 pull
Gems kamu: ${p.gems}
Pity saat ini: ${p.gacha.pity||0}/50`,[btn('Summon ×1','gacha summon 1'),btn('Summon ×10','gacha summon 10'),btn('Lihat Koleksi','inventory')]);
   if(['history','log'].includes(action))return send(ctx,'SUMMON HISTORY',(p.gacha.history||[]).slice(0,8).map((x,i)=>`${i+1}. ${x.rarity} · ${x.name}`).join('\n')||'Belum ada summon.',[btn('Kembali ke Banner','gacha banner')]);
   if(['collection','roster'].includes(action))return send(ctx,'SPIRIT COLLECTION',p.inventory.filter(i=>i.type==='spirit'||i.gachaRarity).map(i=>`• ${i.rarity||'R'} ${i.name} · ${i.id}`).join('\n')||'Belum ada spirit. Coba summon dari banner.',[btn('Summon','gacha summon 1'),btn('Inventory','inventory')]);
   const rawCount=(root==='gacha'?a[1]:a[0]);const count=Number(rawCount||1)===10?10:1;const cost=count===10?270:30;
   if(p.gems<cost)return send(ctx,'GEMS TIDAK CUKUP',`Summon ×${count} memerlukan ${cost} gems. Saldo: ${p.gems} gems. Dapatkan gems dari quest, event, atau hadiah login.`,[btn('Banner & Rates','gacha rates'),btn('Quest','quest')]);
   p.gems-=cost;const rolled=rollGacha(count,Number(p.gacha.pity||0));const pulls=rolled.pulls;p.gacha.pity=rolled.pity;p.gacha.totalPulls=Number(p.gacha.totalPulls||0)+count;for(const item of pulls){const owned=p.inventory.find(x=>x.id===item.id);if(owned){p.spiritShards=Number(p.spiritShards||0)+(item.rarity==='SSR'?10:item.rarity==='SR'?4:1);owned.duplicateCount=Number(owned.duplicateCount||0)+1;}else p.inventory.push({...item,slot:'spirit',equipped:false,obtainedAt:Date.now(),duplicateCount:0});p.gacha.history.unshift({name:item.name,id:item.id,rarity:item.rarity,at:Date.now()});}
   p.gacha.history=p.gacha.history.slice(0,30);await save(ctx,all,key,p);const lines=pulls.map((it,i)=>`${i+1}. ${it.rarity==='SSR'?'🌟':it.rarity==='SR'?'💜':'🔹'} ${it.rarity} · ${it.name}`).join('\n');return send(ctx,count===10?'TEN-PULL SUMMON':'SPIRIT SUMMON',`${lines}\n\nSaldo: ${p.gems} gems · Pity: ${p.gacha.pity}/50 · Spirit Shards: ${p.spiritShards||0}\nDuplicate spirit ditukar otomatis menjadi shards.`,[btn('Summon Lagi','gacha summon 1'),btn('Banner & Rates','gacha rates'),btn('Koleksi Spirit','gacha collection')]);
  }
  if(root==='buff')return send(ctx,'ACTIVE BUFFS',p.buffs.length?p.buffs.map(b=>`• ${b.name||b.id}: ${Math.max(1,Math.ceil((b.expiresAt-Date.now())/60000))} menit`).join('\n'):'Tidak ada buff aktif.');
  if(root==='dungeon'){
   if(['floors','floor','list'].includes(sub)){const rows=Array.from({length:10},(_,i)=>{const n=i+1,s=p.clearedFloors.includes(n)?'✅ CLEAR':n===p.floor&&p.mode==='dungeon'?'🟡 CURRENT':n===1||p.clearedFloors.includes(n-1)?'🔓 AVAILABLE':'🔒 LOCKED';return `${n===10?'BOSS · ':''}Floor ${n}: ${s}`;});return send(ctx,'DUNGEON FLOORS',rows.join('\n'),[btn('Masuk Dungeon','dungeon enter'),btn('Keluar','dungeon exit')]);}
   if(['exit','leave'].includes(sub)){if(p.mode!=='dungeon')return send(ctx,'DUNGEON','Kamu tidak sedang di dungeon.');p.mode='hub';p.dungeonSession=null;await save(ctx,all,key,p);return send(ctx,'DUNGEON EXIT','Kamu keluar. Progres lantai tetap tersimpan.');}
   if(['enter','start','resume',''].includes(sub)){p.mode='dungeon';p.floor=Math.max(1,Math.min(10,Number(p.floor||1)));p.dungeonSession ||= {id:randomUUID(),startedAt:Date.now(),floor:p.floor};await save(ctx,all,key,p);return send(ctx,'DUNGEON PORTAL',`Sesi siap · Floor ${p.floor}\n${web(ctx,`/dungeon?floor=${p.floor}`)}\nGunakan kontrol web untuk bergerak, dodge, dan bertarung.`,[btn('Buka Dungeon','dungeon enter'),btn('Daftar Lantai','dungeon floors'),btn('Keluar','dungeon exit')]);}
   return send(ctx,'DUNGEON','Perintah: dungeon enter | floors | exit');
  }
  if(root==='adventure'){
   if(['exit','leave'].includes(sub)){if(p.mode!=='adventure')return send(ctx,'ADVENTURE','Kamu tidak sedang di adventure.');p.mode='hub';await save(ctx,all,key,p);return send(ctx,'ADVENTURE EXIT','Kamu kembali ke hub. Posisi checkpoint tetap tersimpan.');}
   if(!['enter','start','resume',''].includes(sub))return send(ctx,'ADVENTURE','Perintah: adventure enter | exit');
   p.mode='adventure';await save(ctx,all,key,p);return send(ctx,'AETHERIA OPEN WORLD',`Mode petualangan aktif.\nCheckpoint: ${p.adventure.checkpoint}\nCuaca: ${p.adventure.weather} · Musim: ${p.adventure.season}\n${web(ctx,'/adventure')}\nRoute /adventure harus tersedia pada website agar dunia terbuka dapat dimainkan.`,[btn('Buka Adventure','adventure enter'),btn('Cuaca','weather'),btn('Map','map')]);
  }
  if(root==='guild'){
   if(sub==='create'){const name=a.slice(1).join(' ').trim();if(name.length<3||name.length>32)return send(ctx,'GUILD CREATE','Format: guild create <nama> (3–32 karakter).');if(p.guild)return send(ctx,'GUILD',`Kamu sudah punya guild: ${p.guild.name}`);p.guild={id:randomUUID().slice(0,8).toUpperCase(),name,leader:ctx.pushName||String(ctx.sender),members:1,createdAt:Date.now()};await save(ctx,all,key,p);return send(ctx,'GUILD CREATED',`Guild: ${name}\nID: ${p.guild.id}\nKetua: ${p.guild.leader}\nAnggota: 1`);}
   if(sub==='info')return send(ctx,'GUILD INFO',p.guild?`Nama: ${p.guild.name}\nID: ${p.guild.id}\nKetua: ${p.guild.leader}\nAnggota: ${p.guild.members}`:'Belum ada guild. Gunakan guild create <nama>.');
   return send(ctx,'GUILD','Perintah: guild create <nama> | guild info');
  }
  if(root==='quest')return send(ctx,'ACTIVE QUEST',`${p.quest.complete?'✅ SELESAI':'🟡 AKTIF'} · ${p.quest.title}\nProgres: ${p.quest.progress}/${p.quest.target}\nProgres otomatis butuh event dari server game.`);
  if(root==='weather')return send(ctx,'WORLD WEATHER',`Mode: ${p.mode}\nCuaca: ${p.adventure.weather}\nMusim: ${p.adventure.season}\nCheckpoint: ${p.adventure.checkpoint}`);
  if(root==='map')return send(ctx,'LIVE MAP',`Mode: ${p.mode}\nFloor: ${p.floor}\nCheckpoint: ${p.adventure.checkpoint}\n${web(ctx,p.mode==='adventure'?'/adventure':`/dungeon?floor=${p.floor}`)}`,[btn('Buka Peta','map')]);
  return send(ctx,'RPG EXPANSION','Commands: inventory, equip <slot> <id>, unequip <slot>, use potion [id|nomor], gacha daily|rates|summon 1|summon 10|history|collection, buff, dungeon enter/floors/exit, adventure enter/exit, guild create/info, quest, weather, map.');
 }
};

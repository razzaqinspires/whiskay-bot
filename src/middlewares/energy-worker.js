import {randomUUID} from 'node:crypto';
import {consumeEnergy,recordHit,isCharging,getEnergy} from '../lib/energy-worker.js';
import {getEnergySaver,setEnergySaver} from '../lib/energy-saver.js';
import {createEnergySaverAction} from '../lib/energy-saver-actions.js';
import {estimateWorkload,applyEnergySaver,canExecuteWithEnergy} from '../core/WorkloadCortex.js';
import {workloadTracker} from '../core/WorkloadTracker.js';
import {getMenuSettings} from '../lib/menu-settings.js';
import {renderEnergyNotificationCanvas} from '../services/canvas-v2.js';
const byteLength=value=>{try{return Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value)||'');}catch{return 0;}};
export default async function energyWorker(ctx,next){
 if(!ctx.command||ctx.isBot)return next();
 if(['raidboss','aigenerate'].includes(String(ctx.command).toLowerCase())&&await isCharging(ctx.sender||ctx.chat).catch(()=>false)){ctx.aborted=true;await ctx.reply('⚠️ Tugas berat ditunda saat pengisian baterai aktif.').catch(()=>{});return;}
 const command=String(ctx.command).toLowerCase(),uid=ctx.sender||ctx.chat||'unknown';
 let current,saver,workload,adjusted,profile,sample;
 try{await workloadTracker.load();current=await getEnergy(uid);saver=await getEnergySaver(uid);if(saver.enabled&&Number(current.energy)>=20){await setEnergySaver(uid,false);saver={enabled:false};}sample=workloadTracker.sample();profile=workloadTracker.commandProfile(command);workload=estimateWorkload({command,args:ctx.args||[],plugin:ctx.plugin||{},runtime:{pressureScore:sample.score,commandP95Ms:profile.p95Ms,responseKB:profile.averageResponseKB}});adjusted=applyEnergySaver(workload.cost,{enabled:saver.enabled,energy:current.energy,workload});}
 catch(error){console.error('[ENERGY PRECHECK]',error?.message||error);ctx.aborted=true;await ctx.sendInteractive({title:'Energi Tidak Tersedia',body:'Ledger energi gagal dibaca. Command berbiaya ditahan agar tidak berjalan tanpa pencatatan.',buttons:[{name:'quick_reply',title:'Coba Status',id:`${ctx.prefix||'.'}statusbaterai`},{name:'quick_reply',title:'Hubungi Owner',id:`${ctx.prefix||'.'}owner`}] }).catch(()=>{});return;}
 if(!canExecuteWithEnergy(current.energy,workload.cost,adjusted.cost)){ ctx.aborted=true;const token=await createEnergySaverAction(uid);await ctx.sendInteractive({title:'🔋 Energi Tidak Cukup',subtitle:`Tersisa ${current.energy.toFixed(2)}% · perlu ${adjusted.cost.toFixed(2)}%`,body:`Command ${ctx.prefix||'.'}${command} dihentikan sebelum dijalankan.\nEstimasi biaya: ${adjusted.cost.toFixed(2)}% (${workload.mode}).\n${current.energy<20?'Mode hemat tersedia.':'Mode hemat terkunci sampai energi di bawah 20%.'}`,buttons:[{name:'quick_reply',title:'Isi Energi',id:`${ctx.prefix||'.'}charge`},{name:'quick_reply',title:'Status Energi',id:`${ctx.prefix||'.'}energy status`},{name: 'quick_reply',title:current.energy<20?'🔓 Mode Hemat':'🔒 Mode Hemat',id:`${ctx.prefix||'.'}energysaverbutton ${token}`}] }).catch(()=>{});return;}
 let receipt=null;
 try{if(workload.cost>0){receipt=await consumeEnergy(uid,`${command} ${(ctx.args||[]).join(' ')}`,adjusted.cost);if(receipt?.ok===false){ctx.aborted=true;await ctx.reply(`🔋 Energi berubah sebelum command dijalankan. Tersisa ${Number(receipt.energy||0).toFixed(2)}%, diperlukan ${Number(receipt.required||adjusted.cost).toFixed(2)}%. Command dibatalkan tanpa biaya.`).catch(()=>{});return;}await recordHit(uid,command);}ctx.energyReceipt=receipt;ctx.workloadDecision={...workload,estimatedCost:workload.cost,chargedCost:adjusted.cost,saverApplied:adjusted.saverApplied,savingPercent:adjusted.savingPercent,cooldown:ctx.energyCooldown||null};}
 catch(error){console.error('[ENERGY WORKER]',error?.message||error);ctx.aborted=true;await ctx.reply('Ledger energi tidak dapat mencatat biaya. Command dibatalkan agar tidak berjalan tanpa catatan energi.').catch(()=>{});return;}
 const taskKind=workload.heavy?'heavy':workload.ai?'ai':workload.network?'network':'simple';const taskId=`${command}:${uid}:${randomUUID()}`;workloadTracker.beginTask(taskId,taskKind);
 const originals={reply:ctx.reply,send:ctx.send,interactive:ctx.sendInteractive};let responseBytes=0,completed=false,mergedNotice=false;
 let noticeSettings;try{noticeSettings=await getMenuSettings(uid);}catch{noticeSettings={batteryNotification:'separate',energyNotificationEnabled:true,xpNotificationEnabled:true};}
 const noticeMode=noticeSettings.batteryNotification||'merge';
 const makeFooter=()=>{
  const parts=[];
  if(receipt&&noticeSettings.energyNotificationEnabled!==false)parts.push(`-${Number(receipt.cost).toFixed(2).replace('.',',')}% baterai digunakan. 🔋 ${Number(receipt.energy).toFixed(2).replace('.',',')}% tersisa.`);
  if(ctx.xpAward&&Number(ctx.xpAward.gain)>0&&noticeSettings.xpNotificationEnabled!==false)parts.push(`⭐ +${ctx.xpAward.gain} XP diperoleh.`);
  return parts.join('\n');
 };
 const mediaObject=value=>Boolean(value&&typeof value==='object'&&['image','video','document','audio','sticker'].some(k=>value[k]));
 for(const method of ['reply','send'])if(typeof ctx[method]==='function'){
  const original=ctx[method];ctx[method]=async(...args)=>{
   responseBytes+=byteLength(args[0]);
   const footer=makeFooter(),value=args[0];
   if(footer&&noticeMode==='merge'&&!mediaObject(value)){
    if(typeof value==='string'){args[0]=`${value}\n\n${footer}`;mergedNotice=true;}
    else if(value&&typeof value==='object'&&typeof value.text==='string'&&!mediaObject(value)){args[0]={...value,text:`${value.text}\n\n${footer}`};mergedNotice=true;}
   }
   return original(...args);
  };
 }
 if(typeof ctx.sendInteractive==='function'){const original=ctx.sendInteractive;ctx.sendInteractive=async(...args)=>{responseBytes+=byteLength(args[0]);return original(...args);};}
 ctx.completeEnergyTelemetry=async({durationMs=0,ok=true}={})=>{
  if(completed)return;completed=true;
  workloadTracker.finishTask(taskId,{ok,responseBytes});workloadTracker.recordCommand(command,{durationMs,responseBytes});
  ctx.reply=originals.reply;ctx.send=originals.send;ctx.sendInteractive=originals.interactive;
  const hasEnergy=Boolean(receipt&&noticeSettings.energyNotificationEnabled!==false&&workload.cost>0);
  const xpGain=Number(ctx.xpAward?.gain||0),hasXp=xpGain>0&&noticeSettings.xpNotificationEnabled!==false;
  if(!hasEnergy&&!hasXp)return;
  let finalEnergy=Number(receipt?.energy??current.energy);if(finalEnergy>=20&&saver.enabled){await setEnergySaver(uid,false);saver={enabled:false};}
  const footer=makeFooter();
  if(noticeMode==='hide'&&hasEnergy){if(hasXp)await originals.reply?.(`⭐ +${xpGain} XP diperoleh.`).catch(()=>{});return;}
  // The command reply can be sent before CommandHandler awards XP. If energy
  // was merged into that reply, send the later XP award separately.
  if(noticeMode==='merge'&&mergedNotice){
   if(hasXp)await originals.reply?.(`⭐ +${xpGain} XP diperoleh.`).catch(()=>{});
   return;
  }
  if(noticeMode==='card'&&hasEnergy){
   try{
    const image=await renderEnergyNotificationCanvas({used:receipt.cost,remaining:finalEnergy,xp:hasXp?xpGain:null,level:ctx.xpAward?.profile?.level,workload:workload.mode,runtimeMs:durationMs,payloadKB:responseBytes/1024});
    await originals.interactive?.({title:'🔋 WHISKAY ENERGY · CANVAS V1',image,mimetype:'image/png',fileName:'whiskay-energy-v1.png',body:'Status baterai dan progres workload. Atur kembali melalui .setmenu.',buttons:[{name:'quick_reply',title:'Matikan Notifikasi',id:`${ctx.prefix||'.'}setmenu energy-notice off`},{name:'Pengaturan .setmenu',id:`${ctx.prefix||'.'}setmenu`},{name:'quick_reply',title:'Status Energi',id:`${ctx.prefix||'.'}energy status`}]});
    return;
   }catch(error){console.error('[ENERGY CANVAS]',error?.message||error);}
  }
  if(noticeMode==='separate'&&footer){
   const title=hasEnergy&&hasXp?'🔋 Status Energi & XP':hasEnergy?'🔋 Status Energi':'⭐ Status XP';
   await originals.interactive?.({title,body:footer,buttons:[{name:'quick_reply',title:'Matikan Notifikasi',id:`${ctx.prefix||'.'}setmenu energy-notice off`},{name:'Pengaturan .setmenu',id:`${ctx.prefix||'.'}setmenu`}] }).catch(error=>console.error('[ENERGY NOTICE]',error?.message||error));
  }
  else if((noticeMode==='merge'||!hasEnergy)&&footer){await originals.reply?.(footer).catch(error=>console.error('[ENERGY NOTICE]',error?.message||error));}
 };

 return next();
}

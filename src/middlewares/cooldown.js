import config from '../config/index.js';
import {getRuntimeSwitches,getEnergy} from '../lib/energy-worker.js';
import {getEnergySaver,setEnergySaver} from '../lib/energy-saver.js';
import {estimateWorkload,applyEnergySaver} from '../core/WorkloadCortex.js';
import {workloadTracker} from '../core/WorkloadTracker.js';
const L=new Map();
export default async function cooldown(ctx,next){
 let switches;try{switches=await getRuntimeSwitches();}catch{switches={globalCooldown:true};}
 const globalCooldownDisabled=switches.globalCooldown===false;
 const uid=ctx.senderNumber||ctx.sender||ctx.chat,plugin=ctx.plugin||{};
 if(plugin.skipCooldown===true)return next();
 let cd=Number(plugin.cooldown)||config.cooldown||1500,energy=100,saver={enabled:false};
 try{
  const e=await getEnergy(uid);energy=Number(e.energy);saver=await getEnergySaver(uid);
  if(saver.enabled&&energy>=20){await setEnergySaver(uid,false);saver={enabled:false};}
  if(globalCooldownDisabled&&!(saver.enabled&&energy<20))return next();
  await workloadTracker.load();
  const profile=workloadTracker.commandProfile(ctx.command);
  const sample=workloadTracker.sample();
  const workload=estimateWorkload({command:ctx.command,args:ctx.args||[],plugin,runtime:{pressureScore:sample.score,commandP95Ms:profile.p95Ms,responseKB:profile.averageResponseKB}});
  const adjusted=applyEnergySaver(workload.cost,{enabled:saver.enabled,energy,workload});
  const base=Math.max(Number(plugin.cooldown)||config.cooldown||1500,workload.baseCooldownMs||0);
  cd=Math.round(base*adjusted.cooldownMultiplier);
  ctx.energyCooldown={baseMs:base,requiredMs:cd,workloadMode:workload.mode,saverApplied:adjusted.saverApplied,saverCooldownApplied:adjusted.saverCooldownApplied,savingPercent:adjusted.savingPercent,multiplier:adjusted.cooldownMultiplier,profile,workload};
 }catch(error){console.error('[COOLDOWN INTELLIGENCE]',error?.message||error);}
 const k=uid+':'+ctx.command,now=Date.now(),prev=L.get(k)||0;
 if(now-prev<cd){const remaining=(cd-(now-prev))/1000;await ctx.sendInteractive({title:'⏱️ Cooldown Perintah',body:`${ctx.prefix||'.'}${ctx.command} masih dalam cooldown ${remaining.toFixed(1)} detik.\nDurasi kebijakan: ${(cd/1000).toFixed(1)} detik${ctx.energyCooldown?.saverCooldownApplied?' · mode hemat aktif':''}.`,buttons:[{name:'quick_reply',title:'Status Energi',id:`${ctx.prefix||'.'}energy status`},{name:'quick_reply',title:'Menu',id:`${ctx.prefix||'.'}menu`}] }).catch(()=>{});ctx.aborted=true;return;}
 L.set(k,now);if(L.size>20000){for(const [key,at] of L)if(now-at>3600000)L.delete(key);}await next();
}

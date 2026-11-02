/** Deterministic workload policy. Runtime measurements are telemetry, never an AI/network call. */
const ZERO_COST = new Set(['menu','help','setmenu','status','statusbaterai','statusenergi','battery','batteryinfo','setenergy','resetenergy','energyset','energyreset','profile','charge','modcoin','ping','owner','energy','cortex','typo','memory','reminder','reminders','reminder-audit','nsfw','energysaverbutton']);
const NETWORK = /(?:fetch|axios|http|https|download|scrape|weather|translate|anime|manga|news|github|youtube|tiktok|instagram|facebook|spotify|lyrics|mediafire|pinterest|rednote)/i;
const AI = /(?:^ai$|ask|chatbot|imagine|generate|summarize|review|debate|tutor|captiongen|promptgen)/i;
const HEAVY = /(?:canvas|render|video|batch|playlist|transcode|rpg-sync|raidboss|worldmap|gitclone|zip)/i;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const round=n=>Math.round(n*100)/100;

/** Fail-closed affordability check shared by the energy middleware and regression tests. */
export function hasSufficientEnergy(availableEnergy,requiredEnergy){
 const available=Number(availableEnergy),required=Number(requiredEnergy);
 return Number.isFinite(available)&&Number.isFinite(required)&&available>=0&&required>=0&&available>=required;
}

/** Free workloads bypass the ledger; paid/invalid workloads require a valid covered balance. */
export function canExecuteWithEnergy(availableEnergy,estimatedCost,chargedCost=estimatedCost){
 const estimate=Number(estimatedCost);
 if(!Number.isFinite(estimate)||estimate<0)return false;
 if(estimate===0)return true;
 return hasSufficientEnergy(availableEnergy,chargedCost);
}

export function estimateWorkload({command='',args=[],plugin={},runtime={}}={}){
 const name=String(command).toLowerCase();
 const energyMode=plugin.energyMode;
 const declaredCost=plugin.energyCost;
 const explicitlyFree=declaredCost!==undefined&&declaredCost!==null&&declaredCost!==''&&Number.isFinite(Number(declaredCost))&&Number(declaredCost)===0;
 if(ZERO_COST.has(name)||energyMode === 'free'||explicitlyFree)return {mode:'exempt',cost:0,reason:'control-or-explicit-free',network:false,ai:false,heavy:false,baseCooldownMs:0};
 const input=[name,...(Array.isArray(args)?args:[String(args)])].join(' ').slice(0,1600);
 const network=plugin.workload==='network'||NETWORK.test(name)||/https?:\/\//i.test(input);
 const ai=plugin.workload==='ai'||AI.test(name),heavy=plugin.workload==='heavy'||HEAVY.test(name);
 if(plugin.energyMode==='static'&&Number.isFinite(Number(plugin.energyCost)))return {mode:'static',cost:round(clamp(Number(plugin.energyCost),.05,10)),reason:'declared-static-cost',network,ai,heavy,baseCooldownMs:Math.max(0,Number(plugin.cooldown)||0)};
 const chars=[...input].length, tokens=input.match(/[\p{L}\p{N}_]+/gu)||[];
 const runtimePressure=clamp(Number(runtime.pressureScore||0),0,100)/100;
 const observedMs=clamp(Number(runtime.commandP95Ms||0),0,120000);
 const responseKB=clamp(Number(runtime.responseKB||0),0,2048);
 const base=.18+Math.min(chars,1600)*.0011+Math.min(tokens.length,180)*.004;
 const networkCost=network?1.0+Math.min(observedMs/60000,.8)+Math.min(responseKB/1024,.6):0;
 const aiCost=ai?1.8:0,heavyCost=heavy?2.4:0;
 const pressureCost=runtimePressure*1.1;
 const cost=clamp(base+networkCost+aiCost+heavyCost+pressureCost,.15,9.75);
 const cooldown=clamp((Number(plugin.cooldown)||1500)*(1+(network?.18:0)+(ai?.22:0)+(heavy?.35:0)+runtimePressure*.35+Math.min(observedMs/120000,.4)),500,180000);
 return {mode:'dynamic',cost:round(cost),reason:'runtime-observed-workload-model',network,ai,heavy,baseCooldownMs:Math.round(cooldown),factors:{inputChars:chars,tokens:tokens.length,networkCost:round(networkCost),aiCost,heavyCost,pressureCost:round(pressureCost),observedP95Ms:Math.round(observedMs),responseKB:round(responseKB)}};
}
export function applyEnergySaver(cost,{enabled=false,energy=100,threshold=20,workload={}}={}){
 const unlocked=Number(energy)<threshold;
 if(!enabled||!unlocked)return {cost:round(cost),unlocked,saverApplied:false,saverCooldownApplied:false,savingPercent:0,cooldownMultiplier:1};
 if(cost<=0)return {cost:0,unlocked,saverApplied:false,saverCooldownApplied:true,savingPercent:0,cooldownMultiplier:1.5};
 const reduction=workload.heavy?.62:workload.ai?.55:workload.network?.48:.4;
 const adjusted=round(Math.max(.05,cost*(1-reduction)));
 // An empty/unclassified workload has no reliable telemetry; use the conservative 2.5x fallback.
 const hasWorkloadSignals=['network','ai','heavy'].some(key=>typeof workload?.[key]==='boolean');
 const multiplier=hasWorkloadSignals
  ? clamp(1.35+(workload.network?.35:0)+(workload.ai?.45:0)+(workload.heavy?.7:0),1.35,2.8)
  : 2.5;
 return {cost:adjusted,unlocked,saverApplied:true,saverCooldownApplied:true,savingPercent:Math.round((1-adjusted/Math.max(cost,.01))*100),cooldownMultiplier:multiplier};
}
export function getWorkloadShard({cpuPercent=0,heapUsedMB=0,heapTotalMB=1,queueDepth=0,activeWorkers=0,eventLoopDelayMs=0}={}){
 const heapPercent=heapTotalMB>0?heapUsedMB/heapTotalMB*100:0;
 const score=Math.max(cpuPercent,heapPercent*.85,queueDepth*4+activeWorkers*2,eventLoopDelayMs*1.5);
 return {score:round(score),heapPercent:round(heapPercent),state:score>=75?'CRITICAL':score>=60?'HIGH':score>=50?'ELEVATED':'NORMAL'};
}
export {ZERO_COST};

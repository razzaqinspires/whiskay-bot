import { parentPort } from 'node:worker_threads';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
parentPort.on('message', ({player,enemy})=>{
 const effectiveDamage=Math.max(1,Number(player.weaponPower||1)+Number(player.level||1)/3+5-Number(enemy.defense||0)*.35);
 const turns=Math.max(1,Math.ceil(Number(enemy.hp||1)/effectiveDamage));
 const incoming=Math.max(0,turns-1)*Math.max(1,Number(enemy.attack||1)-Math.floor(Number(player.level||1)/4));
 const effectiveHp=Number(player.hp||0)+(Number(player.potions||0)>0?45:0);
 const gearScore=Number(player.weaponPower||0)*3-Number(enemy.attack||0);
 const hpMargin=effectiveHp-incoming;
 const raw=50+hpMargin*.45+gearScore*.7;
 const confidence=Math.round(clamp(0.55+Math.abs(hpMargin)/(Math.max(1,effectiveHp+incoming))*0.35,0.55,0.92)*100);
 parentPort.postMessage({winProbability:Math.round(clamp(raw,5,95)),estimatedTurns:turns,estimatedIncoming:Math.round(incoming),confidence});
});

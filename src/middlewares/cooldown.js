import config from '../config/index.js';
import { getRuntimeSwitches, getEnergy } from '../lib/energy-worker.js';
import { getEnergySaver } from '../lib/energy-saver.js';
const L = new Map();
export default async function cooldown(ctx, next) {
  let switches; try { switches = await getRuntimeSwitches(); } catch { switches = { globalCooldown: true }; }
  if (switches.globalCooldown === false) return next();
  let cd = (ctx.plugin && ctx.plugin.cooldown) || config.cooldown; const uid = ctx.senderNumber || ctx.sender || ctx.chat; try { const e=await getEnergy(uid); const saver=await getEnergySaver(uid); if(saver.enabled&&Number(e.energy)<20&&ctx.plugin?.energyMode!=='free')cd*=2.5; } catch {} const k = uid + ':' + ctx.command; const now = Date.now(), prev = L.get(k) || 0;
  if (now - prev < cd) { await ctx.reply('⏱️ Cooldown ' + ((cd - (now - prev)) / 1000).toFixed(1) + 's').catch(() => {}); ctx.aborted = true; return; }
  L.set(k, now); await next();
}

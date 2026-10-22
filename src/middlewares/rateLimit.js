import config from '../config/index.js';
import { getRuntimeSwitches } from '../lib/energy-worker.js';
const b = new Map();
export default async function rateLimit(ctx, next) {
  let switches; try { switches = await getRuntimeSwitches(); } catch { switches = { antiSpam: true }; }
  if (switches.antiSpam === false) return next();
  const uid = ctx.senderNumber || ctx.sender || ctx.chat;
  const now = Date.now(), w = config.rateLimit.windowMs; let x = b.get(uid);
  if (!x || now - x.start > w) { x = { start: now, count: 0 }; b.set(uid, x); }
  x.count++; if (x.count > config.rateLimit.max) { if (x.count === config.rateLimit.max + 1) await ctx.reply('Slow down.').catch(() => {}); ctx.aborted = true; return; }
  await next();
}

import { consumeEnergy, energyFooter, recordHit, getRuntimeSwitches, isCharging } from '../lib/energy-worker.js';
import { getMenuSettings } from '../lib/menu-settings.js';
function appendText(content, footer) {
  if (!footer) return content;
  if (typeof content === 'string') return content + footer;
  if (!content || typeof content !== 'object') return content;
  if (typeof content.text === 'string') return { ...content, text: content.text + footer };
  if (typeof content.caption === 'string') return { ...content, caption: content.caption + footer };
  return content;
}
export default async function energyWorker(ctx, next) {
  if (!ctx.command || ctx.isBot) return next();
  const switches = await getRuntimeSwitches();
  if (['raidboss','aigenerate'].includes(String(ctx.command||'').toLowerCase()) && await isCharging(ctx.sender || ctx.chat).catch(() => false)) { ctx.aborted = true; await ctx.reply('⚠️ Peringatan CPU: Cabut charger Anda terlebih dahulu untuk menjalankan tugas berat ini!').catch(() => {}); return; }
  // Runtime switches are deliberately fail-open: an energy ledger failure must not disable normal bot commands.
  let receipt = null;
  try { receipt = await consumeEnergy(ctx.sender || ctx.chat, `${ctx.command} ${(ctx.args || []).join(' ')}`, ctx.plugin?.energyMode === 'static' ? Number(ctx.plugin.energyCost ?? 0.35) : null); await recordHit(ctx.sender || ctx.chat, ctx.command); } catch (error) { console.error('[ENERGY WORKER]', error?.message || error); }
  ctx.energyReceipt = receipt;
  const settings = await getMenuSettings(ctx.sender || ctx.chat).catch(() => ({ batteryNotification: 'merge' }));
  const notification = settings.batteryNotification || 'merge';
  const status = () => energyFooter(ctx.energyReceipt).trim();
  const footer = () => notification === 'merge' ? energyFooter(ctx.energyReceipt) : '';
  let separateSent = false;
  const sendSeparate = async () => { if (notification !== 'separate' || separateSent || !status()) return; separateSent = true; await originalReply(status()).catch(() => {}); };
  const oldReply = ctx.reply, oldSend = ctx.send, oldInteractive = ctx.sendInteractive;
  const originalReply = oldReply;
  if (typeof oldReply === 'function') ctx.reply = async (...args) => { const content = args[0]; const result = await oldReply(appendText(content, footer()), ...args.slice(1)); await sendSeparate(); return result; };
  if (typeof oldSend === 'function') ctx.send = async (...args) => { const content = args[0]; const result = await oldSend(appendText(content, footer()), ...args.slice(1)); await sendSeparate(); return result; };
  if (typeof oldInteractive === 'function') ctx.sendInteractive = async (payload = {}) => { const result = await oldInteractive({ ...payload, body: `${payload.body || ''}${footer()}` }); await sendSeparate(); return result; };
  ctx.energySwitches = switches;
  await next();
}

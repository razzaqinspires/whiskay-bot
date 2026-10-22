import { consumeEnergy, energyFooter, recordHit, getRuntimeSwitches } from '../lib/energy-worker.js';
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
  // Runtime switches are deliberately fail-open: an energy ledger failure must not disable normal bot commands.
  let receipt = null;
  try { receipt = await consumeEnergy(ctx.sender || ctx.chat, `${ctx.command} ${(ctx.args || []).join(' ')}`, ctx.plugin?.energyMode === 'static' ? Number(ctx.plugin.energyCost ?? 0.35) : null); await recordHit(ctx.sender || ctx.chat, ctx.command); } catch (error) { console.error('[ENERGY WORKER]', error?.message || error); }
  ctx.energyReceipt = receipt;
  const footer = () => energyFooter(ctx.energyReceipt);
  const oldReply = ctx.reply, oldSend = ctx.send, oldInteractive = ctx.sendInteractive;
  if (typeof oldReply === 'function') ctx.reply = (content, options) => oldReply(appendText(content, footer()), options);
  if (typeof oldSend === 'function') ctx.send = (content, options) => oldSend(appendText(content, footer()), options);
  if (typeof oldInteractive === 'function') ctx.sendInteractive = (payload = {}) => oldInteractive({ ...payload, body: `${payload.body || ''}${footer()}` });
  ctx.energySwitches = switches;
  await next();
}

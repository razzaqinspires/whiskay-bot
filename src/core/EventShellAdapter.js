/** Narrow adapter between legacy event-shaped plugins and the current Whiskay ctx. */
const pickText = m => String(m?.text ?? m?.body ?? m?.msg ?? m?.message?.conversation ?? m?.message?.extendedTextMessage?.text ?? '');
export function legacyShellToContext(shell, ctx) {
  const m=shell?.m||shell?.message||shell?.cht||shell||{};
  return { ...ctx, chat:ctx?.chat||shell?.chat||m?.chat||m?.id, sender:ctx?.sender||shell?.sender||m?.sender, body:ctx?.body||pickText(m), text:ctx?.text||pickText(m), raw:ctx?.raw||m?.raw||m, quoted:ctx?.quoted||m?.quoted||null, isGroup:Boolean(ctx?.isGroup??shell?.isGroup??m?.isGroup), isOwner:Boolean(ctx?.isOwner), prefix:ctx?.prefix||shell?.prefix||'.', args:Array.isArray(ctx?.args)?ctx.args:[] };
}
export function contextToLegacyShell(ctx) { return { chat:ctx.chat, sender:ctx.sender, isGroup:Boolean(ctx.isGroup), prefix:ctx.prefix||'.', command:ctx.command, args:[...(ctx.args||[])], text:ctx.text||'', m:ctx.raw||null, reply:(...args)=>ctx.reply(...args), send:(...args)=>ctx.send(...args), sendInteractive:(...args)=>ctx.sendInteractive(...args) }; }

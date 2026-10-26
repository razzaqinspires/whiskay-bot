import { isGroupMuted, inspectGroupText } from './group-policy.js';
const noticeAt = new Map();
export async function applyGroupGuard(ctx) {
  if (!ctx?.isGroup || !String(ctx.chat||'').endsWith('@g.us')) return { action:'allow' };
  const body=String(ctx.body || ctx.selectedButtonId || '');
  const ownerControl=Boolean(ctx.isOwner && /^\s*[.,!/#]groupbot\b/i.test(body));
  if (isGroupMuted(ctx.chat) && !ownerControl) return { action:'muted' };
  // If group roles could not be fetched, do not risk moderating a real group admin's message.
  if (!ctx.groupMetadata) return { action:'allow', reason:'group_metadata_unavailable' };
  if (ctx.fromMe || ctx.isBaileys || ctx.isAdmin || ctx.isOwner) return { action:'allow' };
  const verdict=inspectGroupText(ctx.chat,body);
  if (verdict.action!=='block') return verdict;
  if (!ctx.isBotAdmin) return { ...verdict, action:'cannot_delete' };
  try { await ctx.delete(); } catch { return { ...verdict, action:'delete_failed' }; }
  // Keep the group quiet: at most one short notice per group every 45 seconds.
  const now=Date.now(), last=noticeAt.get(ctx.chat)||0;
  if(now-last>45_000) {
    noticeAt.set(ctx.chat,now);
    try { await ctx.sock.sendMessage(ctx.chat,{text:verdict.reason==='text_flood'?'🧹 Pesan berpotensi membuat chat lag dihapus oleh Text Guard.':'🛡️ Pesan dihapus karena cocok dengan filter keamanan grup.'}); } catch {}
  }
  return verdict;
}

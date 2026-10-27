import { isGroupMuted, inspectGroupText } from './group-policy.js';
import { sameUser } from './security.js';
import { getGroupSettings as getOperationalGroupSettings } from './group-settings.js';
const noticeAt = new Map();
const antiLinkHits = new Map();
const participantIsAdmin = participant => ['admin', 'superadmin'].includes(String(participant?.admin || participant?.role || '').toLowerCase()) || Boolean(participant?.isAdmin || participant?.isSuperAdmin);

export async function applyGroupGuard(ctx) {
  if (!ctx?.isGroup || !String(ctx.chat||'').endsWith('@g.us')) return { action:'allow' };
  const body=String(ctx.body || ctx.selectedButtonId || '');
  const ownerControl=Boolean(ctx.isOwner && /^\s*[.,!/#]groupbot\b/i.test(body));
  if (isGroupMuted(ctx.chat) && !ownerControl) return { action:'muted' };
  if (ctx.fromMe || ctx.isBaileys || ctx.isOwner) return { action:'allow' };

  let metadata = ctx.groupMetadata;
  // Tests and plugin callers may supply the socket without preloaded group metadata.
  // An explicit null remains a fail-open sentinel: we do not moderate without role data.
  if (metadata === undefined && typeof ctx.sock?.groupMetadata === 'function') {
    try { metadata = await ctx.sock.groupMetadata(ctx.chat); } catch {}
  }
  if (!metadata) return { action:'allow', reason:'group_metadata_unavailable' };
  const participants = Array.isArray(metadata.participants) ? metadata.participants : [];
  const senderCandidates = [ctx.sender, ctx.raw?.key?.participant, ctx.raw?.key?.participantAlt].filter(Boolean).map(String);
  const botCandidates = [ctx.sock?.user?.id, ctx.sock?.user?.lid].filter(Boolean).map(String);
  const findParticipant = candidates => participants.find(participant => candidates.some(candidate => {
    const ids = [participant?.id, participant?.jid, participant?.lid, participant?.phoneNumber].filter(Boolean).map(String);
    return ids.some(id => sameUser(id, candidate));
  }));
  const caller = findParticipant(senderCandidates), bot = findParticipant(botCandidates);
  const callerAdmin = Boolean(ctx.isAdmin || participantIsAdmin(caller));
  const botAdmin = Boolean(ctx.isBotAdmin || participantIsAdmin(bot));
  if (callerAdmin) return false; // admins' links are not moderated

  const operational = await getOperationalGroupSettings(ctx.chat).catch(() => null);
  const looksLikeUrl = /(?:https?:\/\/|www\.)\S+/i.test(body);
  if (operational?.antilink && looksLikeUrl) {
    if (!botAdmin) return false;
    try {
      if (typeof ctx.delete === 'function') await ctx.delete();
      else await ctx.sock.sendMessage(ctx.chat, { delete: ctx.raw?.key || ctx.key });
    } catch { return false; }
    try { await ctx.reply?.('🛡️ Tautan dibatasi oleh Anti-link grup.'); } catch {}
    return true;
  }

  // Anti-spam is bounded to short-lived counters and a per-group rate-limited notice.
  if (operational?.antispam) {
    const key = `${ctx.chat}:${ctx.sender || 'unknown'}`, now = Date.now();
    const prior = antiLinkHits.get(key);
    const entry = !prior || now - prior.started > 10000 ? { started: now, count: 1, deleted: false } : { ...prior, count: prior.count + 1 };
    antiLinkHits.set(key, entry);
    if (antiLinkHits.size > 2000) for (const [k, v] of antiLinkHits) if (now-v.started > 30000) antiLinkHits.delete(k);
    if (entry.count >= 7 && !entry.deleted && botAdmin) {
      entry.deleted = true;
      try { if (typeof ctx.delete === 'function') await ctx.delete(); else await ctx.sock.sendMessage(ctx.chat,{delete:ctx.raw?.key||ctx.key}); } catch { return false; }
      try { await ctx.reply?.('🧹 Anti-spam membatasi pengiriman pesan beruntun.'); } catch {}
      return true;
    }
  }

  const verdict=inspectGroupText(ctx.chat,body);
  if (verdict.action!=='block') return verdict;
  if (!botAdmin) return { ...verdict, action:'cannot_delete' };
  try { if (typeof ctx.delete === 'function') await ctx.delete(); else await ctx.sock.sendMessage(ctx.chat, { delete: ctx.raw?.key || ctx.key }); } catch { return { ...verdict, action:'delete_failed' }; }
  // Keep the group quiet: at most one short notice per group every 45 seconds.
  const now=Date.now(), last=noticeAt.get(ctx.chat)||0;
  if(now-last>45_000) {
    noticeAt.set(ctx.chat,now);
    try { await ctx.sock.sendMessage(ctx.chat,{text:verdict.reason==='text_flood'?'🧹 Pesan berpotensi membuat chat lag dihapus oleh Text Guard.':'🛡️ Pesan dihapus karena cocok dengan filter keamanan grup.'}); } catch {}
  }
  return verdict;
}

/** Text fallback retained for environments where Canvas V2 rendering is not available. */
export async function sendGroupParticipantNotice(sock, update) {
  const group = String(update?.id || '');
  const action = String(update?.action || '').toLowerCase();
  if (!group.endsWith('@g.us') || !['add','remove','leave'].includes(action) || !Array.isArray(update?.participants)) return;
  const settings = await getOperationalGroupSettings(group).catch(() => ({ welcome: false }));
  if (!settings.welcome) return;
  let groupName = 'WhatsApp Group';
  try { groupName = String((await sock.groupMetadata(group))?.subject || groupName); } catch {}
  for (const participant of update.participants.slice(0, 10)) {
    const jid = String(typeof participant === 'string' ? participant : participant?.id || participant?.jid || '');
    if (!jid || !jid.includes('@')) continue;
    const user = `@${jid.split('@')[0].split(':')[0]}`;
    const template = action === 'add' ? settings.welcomeText : settings.leaveText;
    const text = String(template || (action === 'add' ? '👋 Selamat datang {user} di {group}!' : '👋 {user} telah meninggalkan grup.'))
      .replaceAll('{user}', user).replaceAll('{group}', groupName);
    await sock.sendMessage(group, { text, mentions: [jid] });
  }
}

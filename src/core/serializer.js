/** ESM facade over the project's CommonJS Baileys serializer compatibility layer. */
import compat from './serializer-compat.cjs';
export const sendInteractiveMessage = compat.sendInteractiveMessage;
export const serialize = compat.serialize;
import configDefault from '../config/index.js';
const groupMetaCache = new Map();
export async function serializeMessage(sock, raw, config = configDefault, bot = null) {
  const ctx = compat.serialize(sock, raw);
  if (!ctx) return ctx;
  ctx.sock = sock;
  ctx.bot = bot;
  ctx.config = config;
  ctx.isBot = Boolean(ctx.fromMe || raw?.key?.fromMe);
  const ownerIds = new Set([...(config.owners || []), ...(config.ownerLids || [])].map(String));
  const candidates = [
    ctx.sender, raw?.key?.participant, raw?.key?.participantAlt, raw?.key?.participantPn,
    raw?.key?.remoteJid, raw?.key?.remoteJidAlt, raw?.key?.remoteJidPn
  ].filter(Boolean).map(String);
  const digits = value => value.split('@')[0].split(':')[0].replace(/\D/g, '');
  ctx.isOwner = candidates.some(candidate => {
    if (ownerIds.has(candidate)) return true;
    const candidateDigits = digits(candidate);
    return candidateDigits.length >= 8 && [...ownerIds].some(owner => digits(owner) === candidateDigits);
  });
  ctx.isAdmin = false;
  ctx.isBotAdmin = false;
  if (ctx.isGroup && typeof sock?.groupMetadata === 'function') {
    try {
      const now = Date.now();
      let cached = groupMetaCache.get(ctx.chat);
      if (!cached || now - cached.at > 30_000) {
        cached = { at: now, value: await sock.groupMetadata(ctx.chat) };
        groupMetaCache.set(ctx.chat, cached);
        if (groupMetaCache.size > 500) {
          for (const [jid, row] of groupMetaCache) if (now - row.at > 60_000) groupMetaCache.delete(jid);
        }
      }
      const participants = cached.value?.participants || [];
      const roleOf = jid => participants.find(p => [p.id, p.jid, p.lid].filter(Boolean).includes(jid));
      const senderRole = candidates.map(roleOf).find(Boolean);
      const botCandidates = [sock?.user?.id, sock?.user?.lid].filter(Boolean).map(String);
      const botRole = botCandidates.map(roleOf).find(Boolean);
      ctx.isAdmin = Boolean(senderRole?.admin || senderRole?.isAdmin || senderRole?.isSuperAdmin || senderRole?.role === 'admin' || senderRole?.role === 'superadmin');
      ctx.isBotAdmin = Boolean(botRole?.admin || botRole?.isAdmin || botRole?.isSuperAdmin || botRole?.role === 'admin' || botRole?.role === 'superadmin');
      ctx.groupMetadata = cached.value;
    } catch {}
  }
  ctx.download = async (target = ctx, options = {}) => compat.downloadMedia(target || ctx, sock, options);
  return ctx;
}
export const extendSocket = compat.extendSocket;
export const unwrapMessage = compat.unwrapMessage;
export const downloadMedia = compat.downloadMedia;
export default compat;

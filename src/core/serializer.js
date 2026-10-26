/** ESM facade and LID/PN-aware message adapter for Baileys 7.x. */
import compat from './serializer-compat.cjs';
import { isOwner as ownerCheck } from '../lib/security.js';

export const sendInteractiveMessage = compat.sendInteractiveMessage;
export const serialize = compat.serialize;
export const extendSocket = compat.extendSocket;
export const unwrapMessage = compat.unwrapMessage;
export const downloadMedia = compat.downloadMedia;

const pn = value => typeof value === 'string' && value.endsWith('@s.whatsapp.net') ? value : '';
const lid = value => typeof value === 'string' && value.endsWith('@lid') ? value : '';
const firstPn = (...values) => values.map(pn).find(Boolean) || '';
const firstLid = (...values) => values.map(lid).find(Boolean) || '';
const groupMetadataCache = new Map();
async function getCachedGroupMetadata(sock, jid) {
  const now = Date.now(), cached = groupMetadataCache.get(jid);
  if (cached && cached.expiresAt > now) return cached.value;
  if (typeof sock?.groupMetadata !== 'function') return null;
  try { const value = await sock.groupMetadata(jid); groupMetadataCache.set(jid, { value, expiresAt: now + 30_000 }); return value; }
  catch { return cached?.value || null; }
}
function jidCandidates(value) { const raw=String(value || ''); return [...new Set([raw, raw.replace(/:\d+(?=@)/, '')])].filter(Boolean); }

/**
 * Serialize an incoming Baileys message and retain both identity forms.
 * Baileys 7 may use LID in remoteJid/participant; the *Alt and *Pn fields
 * carry the phone-number JID when the mapping is available.
 */
export async function serializeMessage(sock, raw, config = {}, bot = null) {
  const ctx = compat.serialize(sock, raw);
  if (!ctx || !raw?.key) return ctx;
  const key = raw.key;
  const remotePn = firstPn(key.remoteJidPn, key.remoteJidAlt, key.remoteJid);
  const participantPn = firstPn(key.participantPn, key.participantAlt, key.participant);
  const remoteLid = firstLid(key.remoteJid, key.remoteJidAlt, key.remoteJidPn);
  const participantLid = firstLid(key.participant, key.participantAlt, key.participantPn);

  // Prefer a real PN supplied by Baileys, but preserve group/channel JIDs.
  if (typeof key.remoteJid === 'string' && key.remoteJid.endsWith('@g.us')) ctx.chat = key.remoteJid;
  else if (typeof key.remoteJid === 'string' && (key.remoteJid.endsWith('@newsletter') || key.remoteJid.endsWith('@broadcast'))) ctx.chat = key.remoteJid;
  else if (remotePn) ctx.chat = remotePn;
  else if (remoteLid) ctx.chat = remoteLid;

  if (key.fromMe) {
    const me = firstPn(sock?.user?.id, sock?.authState?.creds?.me?.id, key.participantPn, key.participantAlt, key.participant) || ctx.sender;
    if (me) ctx.sender = me;
  } else if (participantPn) ctx.sender = participantPn;
  else if (participantLid) ctx.sender = participantLid;

  ctx.rawRemoteJid = key.remoteJid || '';
  ctx.remoteJidPn = remotePn || '';
  ctx.remoteJidAlt = key.remoteJidAlt || '';
  ctx.participantPn = participantPn || '';
  ctx.participantAlt = key.participantAlt || '';
  ctx.senderLid = participantLid || (remoteLid && !ctx.isGroup ? remoteLid : '');
  ctx.sock = sock;
  ctx.bot = bot;
  ctx.config = config;

  // Owner detection must compare PN with PN and LID with LID. Never compare
  // arbitrary numeric LID digits against a phone number: those namespaces differ.
  const identities = [ctx.sender, ctx.chat, key.participantPn, key.participantAlt,
    key.remoteJidPn, key.remoteJidAlt, participantPn, remotePn, participantLid, remoteLid]
    .filter(Boolean);
  ctx.isOwner = ownerCheck(identities, config);
  ctx.isAdmin = false;
  ctx.isBotAdmin = false;
  if (ctx.isGroup && typeof ctx.chat === 'string' && ctx.chat.endsWith('@g.us')) {
    const metadata = await getCachedGroupMetadata(sock, ctx.chat);
    if (metadata?.participants) {
      const senderIds = new Set([ctx.sender, ctx.senderLid, key.participant, key.participantAlt, key.participantPn].flatMap(jidCandidates));
      const botIds = new Set([sock?.user?.id, sock?.user?.lid, sock?.authState?.creds?.me?.id, sock?.authState?.creds?.me?.lid].flatMap(jidCandidates));
      const matches = (participant, ids) => [participant?.id, participant?.jid, participant?.phoneNumber, participant?.lid].filter(Boolean).some(id => jidCandidates(id).some(candidate => ids.has(candidate)));
      const senderParticipant = metadata.participants.find(p => matches(p, senderIds));
      const botParticipant = metadata.participants.find(p => matches(p, botIds));
      ctx.isAdmin = Boolean(senderParticipant?.admin || senderParticipant?.isAdmin || senderParticipant?.isSuperAdmin || senderParticipant?.admin === 'admin' || senderParticipant?.admin === 'superadmin');
      ctx.isBotAdmin = Boolean(botParticipant?.admin || botParticipant?.isAdmin || botParticipant?.isSuperAdmin || botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin');
      ctx.groupMetadata = metadata;
    }
  }
  return ctx;
}

export default { ...compat, serializeMessage };

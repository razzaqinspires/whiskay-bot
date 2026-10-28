import { randomBytes } from 'node:crypto';

const sessions = new Map();
const messageIndex = new Map();
const entityIndex = new Map();
const rate = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const cleanNumber = value => String(value ?? '').replace(/[^0-9]/g, '').replace(/^0/, '62');
const toJid = value => {
  const number = cleanNumber(value);
  if (!/^\d{8,15}$/.test(number)) throw new TypeError('Nomor target harus berupa nomor WhatsApp valid (8–15 digit).');
  return `${number}@s.whatsapp.net`;
};
function enforceRate(jid) {
  const now = Date.now(); const entry = rate.get(jid) || { start: now, count: 0 };
  if (now - entry.start >= WINDOW_MS) { entry.start = now; entry.count = 0; }
  entry.count++; rate.set(jid, entry);
  if (entry.count > MAX_PER_WINDOW) throw new Error('Batas pembuatan Menfess tercapai. Coba lagi setelah satu menit.');
}
function release(session) {
  session.active = false; sessions.delete(session.id);
  for (const id of session.messageIds) messageIndex.delete(id);
  entityIndex.delete(session.sender); entityIndex.delete(session.target);
}
export function createMenfessSession({ sender, target, alias = 'Anonim', text }) {
  if (!sender || !text?.trim()) throw new TypeError('Pengirim dan isi pesan wajib diisi.');
  const senderJid = String(sender); const targetJid = toJid(target);
  if (senderJid === targetJid) throw new Error('Target tidak boleh sama dengan pengirim.');
  enforceRate(senderJid);
  if (entityIndex.has(senderJid) || entityIndex.has(targetJid)) throw new Error('Salah satu pengguna sedang terikat pada sesi Menfess aktif.');
  const id = randomBytes(16).toString('hex');
  const session = { id, sender: senderJid, target: targetJid, alias: String(alias).slice(0, 32), createdAt: Date.now(), expiresAt: Date.now() + TTL_MS, active: true, messageIds: [], messages: [] };
  sessions.set(id, session); entityIndex.set(senderJid, id); entityIndex.set(targetJid, id);
  session.messages.push({ from: senderJid, text: String(text).trim().slice(0, 2000), at: Date.now() });
  return { ...session };
}
export function recordMenfessMessage(sessionId, messageId) {
  const session = sessions.get(String(sessionId));
  if (!session?.active || !messageId) return false;
  const id = String(messageId); session.messageIds.push(id); messageIndex.set(id, session.id); return true;
}
export function resolveMenfessReply(quotedMessageId, senderJid) {
  const sessionId = messageIndex.get(String(quotedMessageId || ''));
  const session = sessionId && sessions.get(sessionId);
  if (!session?.active || session.expiresAt < Date.now()) { if (session) release(session); return null; }
  if (![session.sender, session.target].includes(String(senderJid))) return null;
  return { sessionId: session.id, recipient: String(senderJid) === session.sender ? session.target : session.sender, alias: session.alias, active: true };
}
export function endMenfessSession(sessionId, actorJid) {
  const session = sessions.get(String(sessionId));
  if (!session?.active || ![session.sender, session.target].includes(String(actorJid))) return null;
  const result = { id: session.id, sender: session.sender, target: session.target };
  release(session); return result;
}
export function getMenfessSession(sessionId) { const s = sessions.get(String(sessionId)); return s?.active ? { ...s, messageIds: [...s.messageIds], messages: [...s.messages] } : null; }
export function cleanupMenfessSessions(now = Date.now()) { let count = 0; for (const session of sessions.values()) if (session.expiresAt <= now) { release(session); count++; } return count; }
export const menfessInternals = { sessions, messageIndex, entityIndex };

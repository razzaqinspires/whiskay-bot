/** Bounded, process-local short-term chat memory. Keyed by WhatsApp sender ID; never persisted. */
const MAX_TURNS = 8;
const MAX_TEXT = 1200;
const MAX_USERS = 2000;
const sessions = new Map();
function clean(value) { return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, MAX_TEXT); }
export function getConversation(userId) {
  const key = String(userId || '').slice(0, 180);
  if (!key) return [];
  const list = sessions.get(key) || [];
  return list.map(item => ({ ...item }));
}
export function appendConversation(userId, role, content) {
  const key = String(userId || '').slice(0, 180);
  if (!key || !['user', 'assistant'].includes(role)) return;
  if (!sessions.has(key) && sessions.size >= MAX_USERS) sessions.delete(sessions.keys().next().value);
  const list = sessions.get(key) || [];
  list.push({ role, content: clean(content), at: Date.now() });
  sessions.set(key, list.slice(-MAX_TURNS));
}
export function clearConversation(userId) { return sessions.delete(String(userId || '').slice(0, 180)); }
export function memoryStats() { return { sessions: sessions.size, maxUsers: MAX_USERS, maxTurns: MAX_TURNS }; }

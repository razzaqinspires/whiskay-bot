const startedAt = Date.now();
const seen = new Map();
const counters = { requests: 0, accepted: 0, rejected: 0, duplicates: 0, sent: 0, failed: 0, lastEventAt: null, lastResult: null };
const MAX_SEEN = 2000;
export function recordWebhookRequest() { counters.requests++; }
export function recordWebhookRejected(reason = 'unknown') { counters.rejected++; counters.lastResult = `rejected:${reason}`; }
export function recordWebhookAccepted(result = {}) { counters.accepted++; counters.sent += Number(result.sent || 0); counters.failed += Number(result.failed || 0); counters.lastEventAt = new Date().toISOString(); counters.lastResult = `accepted:${result.sent || 0}/${result.total || 0}`; }
export function wasEventSeen(id) {
  if (!id) return false;
  const now = Date.now();
  for (const [key, at] of seen) if (now - at > 24 * 60 * 60 * 1000) seen.delete(key);
  if (seen.has(id)) { counters.duplicates++; return true; }
  return false;
}
export function markEventSeen(id) {
  if (!id) return;
  seen.set(id, Date.now());
  while (seen.size > MAX_SEEN) seen.delete(seen.keys().next().value);
}
export function getWebhookRuntimeStats() {
  return { uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), ...counters, dedupeEntries: seen.size, targetMode: String(process.env.WHISKAY_BOSS_TARGET_GROUPS || '').trim() ? 'allowlist' : 'all-participating-groups' };
}

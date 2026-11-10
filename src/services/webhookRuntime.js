import { createHash } from 'node:crypto';
import path from 'node:path';
import { readJsonFile, writeJsonAtomic, withFileLock } from '../utils/PersistentJsonStore.js';

const startedAt = Date.now();
const seen = new Map();
const DATA_DIR = path.resolve(process.env.WHISKAY_DATA_DIR || 'data');
const STORE_FILE = path.join(DATA_DIR, 'webhook-idempotency.json');
const STORE_LOCK = `${STORE_FILE}.lock`;
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SEEN = 5000;
const counters = { requests: 0, accepted: 0, rejected: 0, duplicates: 0, sent: 0, failed: 0, lastEventAt: null, lastResult: null, persistentClaims: 0 };

const eventKey = id => createHash('sha256').update(String(id)).digest('hex');
const normalizeStore = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error('Webhook idempotency store has an invalid root.');
    error.code = 'WHISKAY_DATA_CORRUPT';
    throw error;
  }
  if (value.version !== 1 || !value.events || typeof value.events !== 'object' || Array.isArray(value.events)) {
    const error = new Error('Webhook idempotency store schema is invalid.');
    error.code = 'WHISKAY_DATA_CORRUPT';
    throw error;
  }
  return value;
};

export function recordWebhookRequest() { counters.requests++; }
export function recordWebhookRejected(reason = 'unknown') { counters.rejected++; counters.lastResult = `rejected:${reason}`; }
export function recordWebhookAccepted(result = {}) { counters.accepted++; counters.sent += Number(result.sent || 0); counters.failed += Number(result.failed || 0); counters.lastEventAt = new Date().toISOString(); counters.lastResult = `accepted:${result.sent || 0}/${result.total || 0}`; }

/** Claim before the external side effect. A persistent processing claim is deliberately at-most-once. */
export async function claimWebhookEvent(id, { ttlMs = EVENT_TTL_MS } = {}) {
  const rawId = String(id || '').trim();
  if (!rawId || rawId.length > 256) throw new TypeError('Webhook event ID is missing or too long.');
  const key = eventKey(rawId), now = Date.now();
  return withFileLock(STORE_LOCK, async () => {
    const store = normalizeStore(await readJsonFile(STORE_FILE, { version: 1, updatedAt: now, events: {} }));
    for (const [eventHash, entry] of Object.entries(store.events)) {
      if (!Number.isFinite(Number(entry?.expiresAt)) || Number(entry.expiresAt) <= now) delete store.events[eventHash];
    }
    const existing = store.events[key];
    if (existing) {
      counters.duplicates++;
      seen.set(key, Number(existing.createdAt) || now);
      return { claimed: false, status: String(existing.status || 'processing') };
    }
    store.events[key] = { status: 'processing', createdAt: now, updatedAt: now, expiresAt: now + Math.max(60000, Math.min(Number(ttlMs) || EVENT_TTL_MS, 7 * EVENT_TTL_MS)), attempts: 1 };
    const entries = Object.entries(store.events).sort((a, b) => Number(a[1]?.createdAt || 0) - Number(b[1]?.createdAt || 0));
    while (entries.length > MAX_SEEN) delete store.events[entries.shift()[0]];
    store.updatedAt = now;
    await writeJsonAtomic(STORE_FILE, store);
    seen.set(key, now);
    while (seen.size > MAX_SEEN) seen.delete(seen.keys().next().value);
    counters.persistentClaims++;
    return { claimed: true, status: 'processing' };
  });
}

/** Persist a bounded outcome summary; no request body, JID, file name or credentials are stored. */
export async function completeWebhookEvent(id, result = {}) {
  const rawId = String(id || '').trim();
  if (!rawId || rawId.length > 256) return false;
  const key = eventKey(rawId), now = Date.now();
  return withFileLock(STORE_LOCK, async () => {
    const store = normalizeStore(await readJsonFile(STORE_FILE, { version: 1, updatedAt: now, events: {} }));
    const current = store.events[key];
    if (!current) return false;
    current.status = 'completed';
    current.updatedAt = now;
    current.result = {
      sent: Math.max(0, Math.min(1000, Math.floor(Number(result.sent) || 0))),
      failed: Math.max(0, Math.min(1000, Math.floor(Number(result.failed) || 0))),
      total: Math.max(0, Math.min(1000, Math.floor(Number(result.total) || 0))),
      outcome: ['sent', 'partial', 'failed'].includes(result.outcome) ? result.outcome : 'sent',
    };
    store.updatedAt = now;
    await writeJsonAtomic(STORE_FILE, store);
    return true;
  });
}

// Compatibility helpers for older callers. New webhook handlers must use the async persistent claim API.
export function wasEventSeen(id) {
  if (!id) return false;
  const key = eventKey(id);
  return seen.has(key);
}
export function markEventSeen(id) {
  if (!id) return;
  seen.set(eventKey(id), Date.now());
  while (seen.size > MAX_SEEN) seen.delete(seen.keys().next().value);
}

export function getWebhookRuntimeStats() {
  return { uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), ...counters, dedupeEntries: seen.size, dedupeStore: 'persistent-sha256-at-most-once', targetMode: String(process.env.WHISKAY_BOSS_TARGET_GROUPS || '').trim() ? 'allowlist' : 'disabled-no-allowlist' };
}

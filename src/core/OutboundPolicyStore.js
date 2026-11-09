import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readJsonFile, withFileLock, writeJsonAtomic } from '../utils/PersistentJsonStore.js';

const ROOT = path.resolve(process.env.WHISKAY_DATA_DIR || 'data');
const DEFAULT_FILE = path.join(ROOT, 'outbound-policy-state.json');
const MAX_EVENTS = 10000;
const MAX_BLOCKED = 2000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const cleanSource = value => String(value || 'background:unattributed').toLowerCase().replace(/[^a-z0-9:_-]/g, '_').slice(0, 80);
const hashPattern = /^[a-f0-9]{24}$/;

function emptyState(now) {
  return { version: 1, updatedAt: now, lastSentAt: 0, events: [], blockedRecent: [], quarantines: {} };
}

function validateState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 ||
      !Array.isArray(value.events) || !Array.isArray(value.blockedRecent) ||
      !value.quarantines || typeof value.quarantines !== 'object' || Array.isArray(value.quarantines) ||
      !Number.isFinite(Number(value.lastSentAt ?? 0)) || !Number.isFinite(Number(value.updatedAt ?? 0))) {
    const error = new Error('Outbound policy store has an invalid schema; refusing to allow untracked outbound traffic.');
    error.code = 'WHISKAY_POLICY_STORE_CORRUPT';
    throw error;
  }
  for (const row of value.events) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !Number.isFinite(Number(row.at)) ||
        !hashPattern.test(String(row.recipientKey || '')) ||
        (row.fingerprint && !hashPattern.test(String(row.fingerprint))) ||
        !/^[a-z0-9:_-]{1,80}$/.test(String(row.source || '')) ||
        !['queued', 'started', 'sent', 'failed'].includes(row.outcome)) {
      const error = new Error('Outbound policy store contains an invalid event row; refusing outbound traffic.');
      error.code = 'WHISKAY_POLICY_STORE_CORRUPT';
      throw error;
    }
  }
  for (const row of value.blockedRecent) {
    if (!row || typeof row !== 'object' || !Number.isFinite(Number(row.at)) ||
        !/^[a-z0-9:_-]{1,80}$/.test(String(row.source || '')) ||
        typeof row.reason !== 'string' ||
        (row.recipientKey && !hashPattern.test(String(row.recipientKey)))) {
      const error = new Error('Outbound policy blocked-event schema is invalid; refusing outbound traffic.');
      error.code = 'WHISKAY_POLICY_STORE_CORRUPT';
      throw error;
    }
  }
  for (const [source, entry] of Object.entries(value.quarantines)) {
    if (!/^[a-z0-9:_-]{1,80}$/.test(source) || !Number.isFinite(Number(entry?.expiresAt))) {
      const error = new Error('Outbound policy quarantine schema is invalid; refusing outbound traffic.');
      error.code = 'WHISKAY_POLICY_STORE_CORRUPT';
      throw error;
    }
  }
  return value;
}

/**
 * Single-host shared outbound policy state. All reservations and quarantine changes
 * are serialized with an exclusive file lock, so PM2/forked processes cannot multiply
 * per-minute limits or bypass source quarantine. Network filesystems/multiple hosts
 * require a real distributed datastore and are intentionally unsupported.
 */
export class OutboundPolicyStore {
  constructor({ file = DEFAULT_FILE, now = () => Date.now(), lockOptions = {} } = {}) {
    this.file = path.resolve(file);
    this.lockFile = `${this.file}.lock`;
    this.now = now;
    this.lockOptions = lockOptions;
  }

  async #withState(fn, options = {}) {
    return withFileLock(this.lockFile, async () => {
      const now = this.now();
      const state = validateState(await readJsonFile(this.file, emptyState(now)));
      const result = await fn(state, now);
      const shouldWrite = typeof options.write === 'function' ? options.write(result) : options.write !== false;
      if (shouldWrite) {
        state.updatedAt = now;
        await writeJsonAtomic(this.file, state);
      }
      return result;
    }, this.lockOptions);
  }

  async reserve({ recipientKey, fingerprint = '', source = 'background:unattributed', globalMaxPerMinute = 20,
    recipientMaxPerMinute = 4, duplicateWindowMs = 30000, queueDepth = 0 } = {}) {
    const recipient = String(recipientKey || '');
    const hash = String(fingerprint || '');
    if (!hashPattern.test(recipient) || (hash && !hashPattern.test(hash))) {
      throw new TypeError('Outbound policy requires one-way recipient and message hashes.');
    }
    const normalizedSource = cleanSource(source);
    const maxGlobal = clamp(globalMaxPerMinute, 1, 10000);
    const maxRecipient = clamp(recipientMaxPerMinute, 1, 1000);
    const duplicateWindow = clamp(duplicateWindowMs, 5000, 3600000);

    return this.#withState((state, now) => {
      const retention = Math.max(300000, duplicateWindow);
      state.events = state.events.filter(row => now - Number(row.at) <= retention).slice(-MAX_EVENTS);
      state.blockedRecent = state.blockedRecent.filter(row => now - Number(row.at) <= 300000).slice(-MAX_BLOCKED);
      for (const [key, entry] of Object.entries(state.quarantines)) {
        if (Number(entry.expiresAt) <= now) delete state.quarantines[key];
      }

      const quarantine = state.quarantines[normalizedSource];
      if (quarantine) {
        const decision = { allowed: false, reason: 'source-quarantine', source: normalizedSource,
          remainingMs: Math.max(0, Number(quarantine.expiresAt) - now), score: 100, state: 'CRITICAL' };
        state.blockedRecent.push({ at: now, source: normalizedSource, reason: decision.reason, recipientKey: recipient });
        state.blockedRecent = state.blockedRecent.slice(-MAX_BLOCKED);
        return decision;
      }

      const recent = state.events.filter(row => Number(row.at) >= now - 60000);
      const recipientRecent = recent.filter(row => row.recipientKey === recipient);
      const duplicate = hash ? state.events.find(row => row.recipientKey === recipient && row.fingerprint === hash && now - Number(row.at) < duplicateWindow) : null;
      const recentFailures = recent.filter(row => row.outcome === 'failed').length;
      const failureRatio = recent.length ? recentFailures / recent.length : 0;
      const globalPressure = recent.length / maxGlobal;
      const recipientPressure = recipientRecent.length / maxRecipient;
      const queuePressure = clamp(queueDepth / 50, 0, 2);
      const score = Math.round(clamp(globalPressure * 30 + recipientPressure * 40 + failureRatio * 15 + queuePressure * 15, 0, 100));
      const stateName = score >= 85 ? 'CRITICAL' : score >= 65 ? 'HIGH' : score >= 40 ? 'ELEVATED' : 'NORMAL';
      let reason = 'allowed';
      if (duplicate) reason = 'duplicate-payload-window';
      else if (recipientRecent.length >= maxRecipient) reason = 'recipient-rate-limit';
      else if (recent.length >= maxGlobal) reason = 'global-rate-limit';
      else if (score >= 85) reason = 'outbound-threat-critical';

      if (reason !== 'allowed') {
        state.blockedRecent.push({ at: now, source: normalizedSource, reason, recipientKey: recipient });
        state.blockedRecent = state.blockedRecent.slice(-MAX_BLOCKED);
        return { allowed: false, reason, score, state: stateName, globalRecent: recent.length, recipientRecent: recipientRecent.length };
      }

      const id = randomUUID();
      state.events.push({ id, at: now, recipientKey: recipient, fingerprint: hash, source: normalizedSource, outcome: 'queued' });
      state.events = state.events.slice(-MAX_EVENTS);
      return { allowed: true, id, score, state: stateName, globalRecent: recent.length + 1, recipientRecent: recipientRecent.length + 1 };
    });
  }

  /**
   * Revalidates rolling policy and acquires the actual cross-process send slot
   * immediately before Baileys is called. Queued reservations have a finite TTL;
   * stale queue entries cannot age out of the rolling window and later burst-send.
   */
  async start(id, { minIntervalMs = 2000, maxWaitMs = 120000, globalMaxPerMinute = 20,
    recipientMaxPerMinute = 4, duplicateWindowMs = 30000, reservationMaxAgeMs = 120000 } = {}) {
    const key = String(id || '');
    if (!key) throw new TypeError('Outbound reservation ID is required.');
    const interval = clamp(minIntervalMs, 0, 60000);
    const maxGlobal = clamp(globalMaxPerMinute, 1, 10000);
    const maxRecipient = clamp(recipientMaxPerMinute, 1, 1000);
    const duplicateWindow = clamp(duplicateWindowMs, 5000, 3600000);
    const reservationTtl = clamp(reservationMaxAgeMs, 10000, 600000);
    const wallStartedAt = Date.now();
    for (;;) {
      let shouldWrite = true;
      let expiredQueued = false;
      const result = await this.#withState((state, now) => {
        const event = state.events.find(row => row.id === key);
        if (!event) { shouldWrite = false; return { started: false, reason: 'reservation-missing' }; }
        if (event.outcome !== 'queued') { shouldWrite = false; return { started: false, reason: 'reservation-not-queued' }; }

        const fail = (reason, detail = {}) => {
          event.outcome = 'failed'; event.failedAt = now;
          state.blockedRecent.push({ at: now, source: event.source, reason, recipientKey: event.recipientKey });
          state.blockedRecent = state.blockedRecent.slice(-MAX_BLOCKED);
          return { started: false, reason, ...detail };
        };

        if (now - Number(event.at) > reservationTtl) return fail('reservation-expired');

        // Re-check source quarantine and rolling limits at the final transport boundary.
        const quarantine = state.quarantines[event.source];
        if (quarantine && Number(quarantine.expiresAt) > now) {
          return fail('source-quarantine-before-send', { remainingMs: Number(quarantine.expiresAt) - now });
        }
        if (quarantine) delete state.quarantines[event.source];

        const windowStart = now - 60000;
        for (const pending of state.events) {
          if (pending.outcome === 'queued' && pending.id !== key && now - Number(pending.at) > reservationTtl) {
            pending.outcome = 'failed'; pending.failedAt = now; expiredQueued = true;
            state.blockedRecent.push({ at: now, source: pending.source, reason: 'reservation-expired', recipientKey: pending.recipientKey });
          }
        }
        state.blockedRecent = state.blockedRecent.slice(-MAX_BLOCKED);
        const recent = state.events.filter(row => row.id !== key && Number(row.startedAt || row.at) >= windowStart && Number(row.startedAt || row.at) <= now);
        const recipientRecent = recent.filter(row => row.recipientKey === event.recipientKey);
        const duplicate = event.fingerprint ? recent.find(row => row.recipientKey === event.recipientKey && row.fingerprint === event.fingerprint && now - Number(row.startedAt || row.at) < duplicateWindow) : null;
        if (duplicate) return fail('duplicate-payload-final-boundary');
        if (recipientRecent.length >= maxRecipient) return fail('recipient-rate-limit-final-boundary', { recent: recipientRecent.length });
        if (recent.length >= maxGlobal) return fail('global-rate-limit-final-boundary', { recent: recent.length });

        const waitMs = Math.max(0, interval - (now - Number(state.lastSentAt || 0)));
        if (waitMs > 0) { shouldWrite = expiredQueued; return { started: false, waitMs }; }
        state.lastSentAt = now;
        event.at = now; event.startedAt = now; event.outcome = 'started';
        return { started: true, startedAt: now };
      }, { write: () => shouldWrite });
      if (result.started) return result;
      if (result.reason) {
        const error = new Error(`Outbound reservation blocked at final send boundary: ${result.reason}.`);
        error.code = result.reason === 'source-quarantine-before-send'
          ? 'WHISKAY_OUTBOUND_SOURCE_QUARANTINED'
          : 'WHISKAY_OUTBOUND_FINAL_POLICY_BLOCKED';
        error.policy = result;
        throw error;
      }
      if (!result.waitMs) {
        const error = new Error('Outbound reservation cannot start.');
        error.code = 'WHISKAY_OUTBOUND_RESERVATION_INVALID'; error.policy = result; throw error;
      }
      if (Date.now() - wallStartedAt + result.waitMs > maxWaitMs) {
        const error = new Error('Timed out waiting for the shared outbound send slot.');
        error.code = 'WHISKAY_OUTBOUND_SLOT_TIMEOUT'; throw error;
      }
      await sleep(Math.min(result.waitMs, 250));
    }
  }

  async complete(id, outcome = 'sent') {
    const key = String(id || '');
    if (!key) return false;
    return this.#withState(state => {
      const event = state.events.find(row => row.id === key);
      if (!event || !['queued', 'started'].includes(event.outcome)) return false;
      event.outcome = outcome === 'sent' ? 'sent' : 'failed';
      return true;
    });
  }

  async quarantine(source, { ttlMs = 60000, reason = 'high-confidence-source-burst' } = {}) {
    const key = cleanSource(source);
    if (!key || key === 'background:unattributed') return false;
    return this.#withState((state, now) => {
      state.quarantines[key] = {
        expiresAt: now + clamp(ttlMs, 10000, 3600000),
        reason: String(reason || 'threat-policy').slice(0, 120),
      };
      return true;
    });
  }

  async getQuarantine(source) {
    const key = cleanSource(source);
    return this.#withState((state, now) => {
      const entry = state.quarantines[key];
      if (!entry || Number(entry.expiresAt) <= now) {
        delete state.quarantines[key];
        return null;
      }
      return { source: key, ...entry, remainingMs: Number(entry.expiresAt) - now };
    });
  }

  async listQuarantines() {
    return this.#withState((state, now) => Object.entries(state.quarantines)
      .filter(([, entry]) => Number(entry.expiresAt) > now)
      .map(([source, entry]) => ({ source, ...entry, remainingMs: Number(entry.expiresAt) - now })));
  }

  async clearQuarantines() {
    return this.#withState(state => {
      const count = Object.keys(state.quarantines).length;
      state.quarantines = {};
      return count;
    });
  }

  async snapshot() {
    return this.#withState(state => ({
      events: state.events.map(row => ({ ...row })),
      blockedRecent: state.blockedRecent.map(row => ({ ...row })),
      quarantines: Object.entries(state.quarantines).map(([source, entry]) => ({ source, ...entry })),
      lastSentAt: Number(state.lastSentAt || 0),
    }));
  }
}

export const outboundPolicyStore = new OutboundPolicyStore();

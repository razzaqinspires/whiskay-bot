import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ALLOWED_TYPES = new Set([
  'player.snapshot.updated', 'player.position.updated', 'player.inventory.updated',
  'player.combat.logged', 'world.event.updated', 'economy.transaction.created',
  'pet.stage.updated', 'menfess.notification.created',
]);
const clone = (value) => JSON.parse(JSON.stringify(value));

/** File-backed durable queue for a single bot process. Use a DB outbox for multi-replica deployments. */
export function createDurableEventOutbox({ filePath = path.resolve('data/outbox/events.json'), maxAttempts = 8, now = () => Date.now() } = {}) {
  let queue = Promise.resolve();
  let initialized = false;
  let records = [];
  const serialize = (fn) => { const next = queue.then(fn, fn); queue = next.catch(() => {}); return next; };
  async function persist() {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify({ version: 1, records }, null, 2), { mode: 0o600 });
    await rename(tmp, filePath);
  }
  async function init() {
    if (initialized) return;
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8'));
      if (parsed?.version !== 1 || !Array.isArray(parsed.records)) throw new Error('invalid_outbox_format');
      records = parsed.records;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      records = [];
    }
    initialized = true;
  }
  return {
    async enqueue({ eventId = randomUUID(), type, payload, idempotencyKey = eventId } = {}) {
      return serialize(async () => {
        await init();
        if (!ALLOWED_TYPES.has(type)) throw new Error('event_type_not_allowed');
        if (typeof eventId !== 'string' || eventId.length < 8 || eventId.length > 128) throw new Error('invalid_event_id');
        if (typeof idempotencyKey !== 'string' || !idempotencyKey || idempotencyKey.length > 160) throw new Error('invalid_idempotency_key');
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid_event_payload');
        const duplicate = records.find((r) => r.idempotencyKey === idempotencyKey);
        if (duplicate) return { ...clone(duplicate), duplicate: true };
        const record = { eventId, idempotencyKey, type, payload: clone(payload), createdAt: new Date(now()).toISOString(), attempts: 0, nextAttemptAt: now(), status: 'pending', lastError: null };
        records.push(record); await persist(); return clone(record);
      });
    },
    async pending(limit = 50) {
      return serialize(async () => { await init(); const at = now(); return clone(records.filter((r) => r.status === 'pending' && r.nextAttemptAt <= at).slice(0, Math.max(1, Math.min(200, limit)))); });
    },
    async markDelivered(eventId) {
      return serialize(async () => { await init(); const r = records.find((x) => x.eventId === eventId); if (!r) return false; r.status = 'delivered'; r.deliveredAt = new Date(now()).toISOString(); r.lastError = null; await persist(); return true; });
    },
    async markFailed(eventId, error) {
      return serialize(async () => { await init(); const r = records.find((x) => x.eventId === eventId); if (!r) return false; r.attempts += 1; r.lastError = String(error?.message || error || 'unknown_error').slice(0, 500); if (r.attempts >= maxAttempts) r.status = 'dead'; else { r.status = 'pending'; r.nextAttemptAt = now() + Math.min(3600000, 1000 * (2 ** (r.attempts - 1))); } await persist(); return true; });
    },
    async stats() { return serialize(async () => { await init(); return records.reduce((a, r) => { a.total += 1; a[r.status] = (a[r.status] || 0) + 1; return a; }, { total: 0, pending: 0, delivered: 0, dead: 0 }); }); },
    async compact({ keepDelivered = 500 } = {}) { return serialize(async () => { await init(); const delivered = records.filter((r) => r.status === 'delivered'); const keepIds = new Set(delivered.slice(-Math.max(0, keepDelivered)).map((r) => r.eventId)); records = records.filter((r) => r.status !== 'delivered' || keepIds.has(r.eventId)); await persist(); return records.length; }); },
  };
}

export const durableEventTypes = [...ALLOWED_TYPES];

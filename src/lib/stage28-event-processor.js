/** Stage 28: bounded, idempotent event processing primitives. Single-process only. */
import { randomUUID } from 'node:crypto';

export function createEventEnvelope(type, payload, options = {}) {
  if (typeof type !== 'string' || !/^[a-z][a-z0-9._-]{2,95}$/.test(type)) throw new TypeError('Invalid event type');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('Payload must be an object');
  return { event_id: options.eventId || randomUUID(), event_type: type, payload, occurred_at: options.occurredAt || new Date().toISOString(), schema_version: 1 };
}

/** In-memory idempotency guard; use database unique constraints for multi-instance deployments. */
export function createIdempotentProcessor({ handle, maxSeen = 5000 }) {
  if (typeof handle !== 'function') throw new TypeError('handle must be a function');
  const seen = new Map();
  return async (event) => {
    if (!event || typeof event.event_id !== 'string' || !event.event_id) throw new TypeError('event_id required');
    if (seen.has(event.event_id)) return { status: 'duplicate', event_id: event.event_id };
    // Mark only after success, so failed work can be retried.
    await handle(event);
    seen.set(event.event_id, Date.now());
    while (seen.size > maxSeen) seen.delete(seen.keys().next().value);
    return { status: 'processed', event_id: event.event_id };
  };
}

export function retryDelayMs(attempt, { baseMs = 1000, maxMs = 300000, jitter = 0 } = {}) {
  const n = Math.max(0, Math.min(30, Number(attempt) || 0));
  const raw = Math.min(maxMs, baseMs * (2 ** n));
  return Math.max(0, Math.round(raw * (1 + Math.max(-0.5, Math.min(0.5, jitter)))));
}

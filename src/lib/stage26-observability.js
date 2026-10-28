import { randomUUID } from 'node:crypto';

const counters = { received: 0, commands: 0, errors: 0 };
const startedAt = Date.now();

/** Create a low-cardinality correlation envelope; never put message body or secrets in metrics. */
export function createMessageEnvelope(raw = {}) {
  const key = raw?.key || {};
  return Object.freeze({
    correlationId: randomUUID(),
    receivedAt: Date.now(),
    messageId: String(key.id || '').slice(0, 160),
    chatId: String(key.remoteJid || '').slice(0, 180),
    fromMe: Boolean(key.fromMe),
    hasMessage: Boolean(raw?.message),
  });
}

export function recordMessageMetric(kind = 'received') {
  if (Object.prototype.hasOwnProperty.call(counters, kind)) counters[kind] += 1;
}

export function getStage26Health() {
  return { uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), ...counters };
}

export function resetStage26Metrics() {
  for (const key of Object.keys(counters)) counters[key] = 0;
}

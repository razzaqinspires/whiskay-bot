import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessageEnvelope, getStage26Health, recordMessageMetric, resetStage26Metrics } from '../src/lib/stage26-observability.js';

test('Stage 26 envelope has unique correlation ID and excludes body content', () => {
  const raw = { key: { id: 'abc', remoteJid: '123@s.whatsapp.net', fromMe: false }, message: { conversation: 'secret body' } };
  const one = createMessageEnvelope(raw); const two = createMessageEnvelope(raw);
  assert.ok(one.correlationId); assert.notEqual(one.correlationId, two.correlationId);
  assert.equal(one.messageId, 'abc'); assert.equal('body' in one, false);
});
test('Stage 26 counters are bounded to known metric names', () => {
  resetStage26Metrics(); recordMessageMetric('received'); recordMessageMetric('commands'); recordMessageMetric('errors');
  const health = getStage26Health();
  assert.equal(health.received, 1); assert.equal(health.commands, 1); assert.equal(health.errors, 1);
  assert.ok(health.uptimeSeconds >= 0);
  resetStage26Metrics();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCountdown } from '../src/plugins/general/newcmd.js';

test('Stage 23 new-command countdown reports exact remaining hours/minutes', () => {
  const now = 10_000_000;
  const value = formatCountdown(now - (6 * 60 * 60 * 1000 + 17 * 60 * 1000), now);
  assert.equal(value.active, true);
  assert.equal(value.hours, 161);
  assert.equal(value.minutes, 43);
});

test('Stage 23 new-command countdown expires after seven days', () => {
  const now = 100_000_000;
  const value = formatCountdown(now - 7 * 24 * 60 * 60 * 1000, now);
  assert.equal(value.active, false);
  assert.equal(value.hours, 0);
  assert.equal(value.minutes, 0);
});

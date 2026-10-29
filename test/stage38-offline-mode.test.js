import test from 'node:test';
import assert from 'node:assert/strict';
import { formatOfflineStatus, normalizeOfflineStatus, shouldBlockForOffline } from '../src/lib/offline-mode.js';

test('offline status normalizes fields and strips line breaks/control chars', () => {
  const value = normalizeOfflineStatus({ enabled: true, reason: 'Maintenance\nInjected\u0000text', since: 1000, changedBy: 'owner' });
  assert.equal(value.enabled, true);
  assert.equal(value.reason, 'Maintenance Injected text');
  assert.equal(value.since, 1000);
});

test('disabled or malformed offline status does not block commands', () => {
  assert.equal(shouldBlockForOffline({ status: null, command: 'game' }), false);
  assert.equal(shouldBlockForOffline({ status: { enabled: false }, command: 'game' }), false);
  assert.equal(shouldBlockForOffline({ status: { enabled: 'yes' }, command: 'game' }), false);
});

test('offline mode blocks normal user commands but allows owner and essential commands', () => {
  const status = { enabled: true, reason: 'maintenance', since: 1000 };
  assert.equal(shouldBlockForOffline({ status, isOwner: false, command: 'tebakgambar' }), true);
  assert.equal(shouldBlockForOffline({ status, isOwner: true, command: 'tebakgambar' }), false);
  for (const command of ['offline', 'online', 'offlinestatus', 'menu', 'help', 'ping', 'start', 'owner', 'daftar', 'register', 'statusdaftar']) {
    assert.equal(shouldBlockForOffline({ status, command }), false, `${command} should remain available`);
  }
});

test('offline status message includes safe reason and timestamp', () => {
  const rendered = formatOfflineStatus({ enabled: true, reason: 'Perawatan server', since: 0 });
  assert.match(rendered, /MODE OFFLINE/);
  assert.match(rendered, /Perawatan server/);
  assert.match(formatOfflineStatus(null), /ONLINE/);
});

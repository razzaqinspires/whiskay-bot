import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('Baileys reconnect is single-flight and generation guarded', async () => {
  const source = await read('src/core/Bot.js');
  assert.match(source, /if \(this\._connectPromise\) return this\._connectPromise/);
  assert.match(source, /const generation = \+\+this\._socketGeneration/);
  assert.match(source, /generation !== this\._socketGeneration \|\| sock !== this\._sock/);
  assert.match(source, /if \(this\._sock === sock\) this\._sock = null/);
});

test('transient disconnects retry indefinitely with capped exponential backoff and jitter', async () => {
  const source = await read('src/core/Bot.js');
  assert.match(source, /Math\.min\(60000, 1000 \* \(2 \*\* Math\.min\(this\._reconnectAttempt - 1, 6\)\)\)/);
  assert.match(source, /Math\.random\(\)/);
  assert.match(source, /this\._scheduleReconnect\(\{ immediate, reason, statusCode \}\)/);
  assert.doesNotMatch(source, /MAX_ATTEMPTS|Reconnect menyerah/);
  assert.match(source, /clearTimeout\(this\._reconnectTimer\)/);
});

test('daemon preflight treats absent bundled cloudflared binaries as optional', async () => {
  const daemon = await read('scripts/daemon.mjs');
  const start = await read('scripts/start.mjs');
  assert.match(daemon, /not installed; optional/);
  assert.match(daemon, /Cloudflared executable/);
  assert.match(start, /not installed \(optional\)/);
  assert.match(start, /cloudflared version/);
});

test('release metadata is bumped consistently', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const lock = JSON.parse(await read('package-lock.json'));
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
});

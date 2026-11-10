import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { withFileLock } from '../src/utils/PersistentJsonStore.js';

test('persistent file lock serializes writers and releases only its own token', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-lock-'));
  const lock = path.join(root, 'store.json.lock');
  const order = [];
  try {
    await Promise.all([
      withFileLock(lock, async () => { order.push('first:start'); await new Promise(resolve => setTimeout(resolve, 35)); order.push('first:end'); }),
      withFileLock(lock, async () => { order.push('second:start'); order.push('second:end'); }),
    ]);
    assert.deepEqual(order, ['first:start', 'first:end', 'second:start', 'second:end']);

    await withFileLock(lock, async () => {
      await writeFile(lock, JSON.stringify({ token: 'replacement-owner', pid: process.pid, hostname: 'external' }));
    });
    assert.equal(JSON.parse(await readFile(lock, 'utf8')).token, 'replacement-owner');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('plugin manager and command dispatcher expose lease-based disposal hooks', async () => {
  const manager = await readFile(new URL('../src/core/PluginManager.js', import.meta.url), 'utf8');
  const handler = await readFile(new URL('../src/core/CommandHandler.js', import.meta.url), 'utf8');
  const bot = await readFile(new URL('../src/core/Bot.js', import.meta.url), 'utf8');
  assert.match(manager, /async disposeAll\(/);
  assert.match(manager, /plugin\.dispose/);
  assert.match(manager, /this\._retired\.add\(plugin\)/);
  assert.match(manager, /pendingDisposals: this\._pendingDisposals\.size/);
  assert.match(handler, /this\._pm\.acquire/);
  assert.match(handler, /releasePluginLease\(\)/);
  assert.match(bot, /plugin-disposal/);
});

test('AutoCleaner explicitly protects runtime data and requires stale artifacts', async () => {
  const cleaner = await readFile(new URL('../src/core/AutoCleaner.js', import.meta.url), 'utf8');
  assert.match(cleaner, /\[\\\\\/]data\[\\\\\/\]/);
  assert.match(cleaner, /minAgeMs = 60 \* 60 \* 1000/);
  assert.match(cleaner, /Math\.max\(60 \* 60 \* 1000/);
  assert.match(cleaner, /lstat\(f\)/);
  assert.match(cleaner, /st\.isSymbolicLink\(\)/);
  assert.match(cleaner, /skippedFresh/);
});

test('persistent lock refuses to reclaim malformed stale owner metadata', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-lock-malformed-'));
  const lock = path.join(root, 'store.json.lock');
  try {
    await writeFile(lock, '{partial', { mode: 0o600 });
    await assert.rejects(withFileLock(lock, async () => 'acquired', { timeoutMs: 120, staleMs: 1, retryMs: 10 }), error => error.code === 'WHISKAY_LOCK_TIMEOUT');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

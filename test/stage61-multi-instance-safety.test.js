import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const root = path.resolve(new URL('..', import.meta.url).pathname);
const TRACKER_MODULE = new URL('../src/core/WorkloadTracker.js', import.meta.url).href;
const runNode = (dir, code, extraEnv = {}) => execFileAsync(process.execPath, ['--input-type=module', '-e', code], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'test', WHISKAY_DATA_DIR: dir, ...extraEnv },
  timeout: 45000,
  maxBuffer: 1024 * 1024,
});
const tempDir = prefix => mkdtemp(path.join(os.tmpdir(), prefix));
const trackerPrelude = `import path from 'node:path';
import { WorkloadTracker } from '${TRACKER_MODULE}';
const dir = process.env.WHISKAY_DATA_DIR;
const tracker = new WorkloadTracker({
  storageFile: path.join(dir, 'telemetry-' + process.pid + '.json'),
  sharedPolicyFile: path.join(dir, 'outbound-policy-state.json'),
  outboundGlobalMaxPerMinute: Number(process.env.TEST_GLOBAL_MAX || 20),
  outboundRecipientMaxPerMinute: Number(process.env.TEST_RECIPIENT_MAX || 4),
  outboundDuplicateWindowMs: 30000,
  outboundMinIntervalMs: Number(process.env.TEST_MIN_INTERVAL || 0),
});`;

async function runMany(dir, count, code, env = {}) {
  return Promise.all(Array.from({ length: count }, () => execFileAsync(process.execPath,
    ['--input-type=module', '-e', `${trackerPrelude}\n${code}`], {
      cwd: root,
      env: { ...process.env, NODE_ENV: 'test', WHISKAY_DATA_DIR: dir, ...env },
      timeout: 45000,
      maxBuffer: 1024 * 1024,
    })));
}

test('global outbound per-minute limit is shared across independent Node processes', async () => {
  const dir = await tempDir('whiskay-stage61-global-');
  try {
    const results = await runMany(dir, 10, `
      const result = await tracker.reserveOutbound({ recipientKey: '${'a'.repeat(24)}', fingerprint: process.pid.toString(16).padStart(24, '0').slice(-24), source: 'command:multi' });
      console.log(result.allowed ? 'ALLOWED' : 'BLOCKED:' + result.reason);
      await tracker.close();
    `, { TEST_GLOBAL_MAX: '3', TEST_RECIPIENT_MAX: '20' });
    const allowed = results.filter(row => row.stdout.includes('ALLOWED')).length;
    const globalBlocked = results.filter(row => row.stdout.includes('BLOCKED:global-rate-limit')).length;
    assert.equal(allowed, 3);
    assert.equal(globalBlocked, 7);
    const state = JSON.parse(await readFile(path.join(dir, 'outbound-policy-state.json'), 'utf8'));
    assert.equal(state.events.length, 3);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('per-recipient limit is shared across independent Node processes', async () => {
  const dir = await tempDir('whiskay-stage61-recipient-');
  try {
    const results = await Promise.all(Array.from({ length: 6 }, (_, index) => runNode(dir, `
      ${trackerPrelude}
      const result = await tracker.reserveOutbound({ recipientKey: '${'a'.repeat(24)}', fingerprint: '${String(index + 1).padStart(24, '0')}', source: 'command:multi' });
      console.log(result.allowed ? 'ALLOWED' : 'BLOCKED:' + result.reason);
      await tracker.close();
    `, { TEST_GLOBAL_MAX: '20', TEST_RECIPIENT_MAX: '2' })));
    assert.equal(results.filter(row => row.stdout.includes('ALLOWED')).length, 2);
    assert.equal(results.filter(row => row.stdout.includes('BLOCKED:recipient-rate-limit')).length, 4);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('duplicate fingerprint is claimed only once across independent Node processes', async () => {
  const dir = await tempDir('whiskay-stage61-duplicate-');
  try {
    const results = await Promise.all(Array.from({ length: 8 }, () => runNode(dir, `
      ${trackerPrelude}
      const result = await tracker.reserveOutbound({ recipientKey: '${'b'.repeat(24)}', fingerprint: '${'c'.repeat(24)}', source: 'command:multi' });
      console.log(result.allowed ? 'ALLOWED' : 'BLOCKED:' + result.reason);
      await tracker.close();
    `)));
    assert.equal(results.filter(row => row.stdout.includes('ALLOWED')).length, 1);
    assert.equal(results.filter(row => row.stdout.includes('BLOCKED:duplicate-payload-window')).length, 7);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('source quarantine is immediately enforced by another process', async () => {
  const dir = await tempDir('whiskay-stage61-quarantine-');
  try {
    const quarantine = await runNode(dir, `
      ${trackerPrelude}
      await tracker.quarantineSource('command:unsafe', { ttlMs: 60000, reason: 'cross-instance-test' });
      await tracker.close();
      console.log('QUARANTINED');
    `);
    assert.match(quarantine.stdout, /QUARANTINED/);
    const attempt = await runNode(dir, `
      ${trackerPrelude}
      const result = await tracker.reserveOutbound({ recipientKey: '${'d'.repeat(24)}', fingerprint: '${'e'.repeat(24)}', source: 'command:unsafe' });
      console.log(result.allowed ? 'UNEXPECTED_ALLOW' : 'BLOCKED:' + result.reason);
      await tracker.close();
    `);
    assert.match(attempt.stdout, /BLOCKED:source-quarantine/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('quarantine after reservation but before send blocks the queued outbound job', async () => {
  const dir = await tempDir('whiskay-stage61-queued-quarantine-');
  try {
    const result = await runNode(dir, `
      ${trackerPrelude}
      const reservation = await tracker.reserveOutbound({ recipientKey: '${'7'.repeat(24)}', fingerprint: '${'8'.repeat(24)}', source: 'command:queued-risk' });
      if (!reservation.allowed) throw new Error('reservation unexpectedly blocked');
      await tracker.quarantineSource('command:queued-risk', { ttlMs: 60000, reason: 'queued-job-test' });
      try {
        await tracker.startOutbound(reservation.id);
        throw new Error('queued message unexpectedly started');
      } catch (error) {
        if (error.code !== 'WHISKAY_OUTBOUND_SOURCE_QUARANTINED') throw error;
        console.log('QUEUED_BLOCKED:' + error.code);
      }
      await tracker.close();
    `);
    assert.match(result.stdout, /QUEUED_BLOCKED:WHISKAY_OUTBOUND_SOURCE_QUARANTINED/);
    const state = JSON.parse(await readFile(path.join(dir, 'outbound-policy-state.json'), 'utf8'));
    assert.equal(state.events[0].outcome, 'failed');
    assert.ok(state.blockedRecent.some(row => row.reason === 'source-quarantine-before-send'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('shared send-slot scheduler enforces a global interval across independent processes', async () => {
  const dir = await tempDir('whiskay-stage61-send-slot-');
  try {
    const results = await Promise.all(Array.from({ length: 3 }, (_, index) => runNode(dir, `
      ${trackerPrelude}
      const result = await tracker.reserveOutbound({ recipientKey: '${String(index + 10).padStart(24, '0')}', fingerprint: '${String(index + 20).padStart(24, '0')}', source: 'command:slot' });
      if (!result.allowed) throw new Error(JSON.stringify(result));
      const slot = await tracker.startOutbound(result.id);
      console.log('STARTED:' + slot.startedAt);
      await tracker.completeOutbound(result.id, 'sent');
      await tracker.close();
    `, { TEST_GLOBAL_MAX: '10', TEST_RECIPIENT_MAX: '10', TEST_MIN_INTERVAL: '180' })));
    const stamps = results.map(row => Number(row.stdout.match(/STARTED:(\d+)/)?.[1])).sort((a, b) => a - b);
    assert.equal(stamps.length, 3);
    assert.ok(stamps.every(Number.isFinite));
    assert.ok(stamps[1] - stamps[0] >= 150, `first interval too short: ${stamps}`);
    assert.ok(stamps[2] - stamps[1] >= 150, `second interval too short: ${stamps}`);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('corrupt shared outbound policy state fails closed and remains unchanged', async () => {
  const dir = await tempDir('whiskay-stage61-corrupt-');
  try {
    const file = path.join(dir, 'outbound-policy-state.json');
    const damaged = '{not-valid-json';
    await writeFile(file, damaged);
    const result = await runNode(dir, `
      ${trackerPrelude}
      try {
        await tracker.reserveOutbound({ recipientKey: '${'f'.repeat(24)}', fingerprint: '${'1'.repeat(24)}', source: 'command:test' });
        process.exitCode = 2;
      } catch (error) {
        if (!['WHISKAY_DATA_CORRUPT','WHISKAY_POLICY_STORE_CORRUPT'].includes(error.code)) throw error;
        console.log('FAIL_CLOSED:' + error.code);
      } finally { await tracker.close(); }
    `);
    assert.match(result.stdout, /FAIL_CLOSED:/);
    assert.equal(await readFile(file, 'utf8'), damaged);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('schema-invalid shared policy metadata fails closed without rewriting state', async () => {
  const dir = await tempDir('whiskay-stage61-schema-');
  try {
    const seed = await runNode(dir, `
      ${trackerPrelude}
      const result = await tracker.reserveOutbound({ recipientKey: '${'9'.repeat(24)}', fingerprint: '${'a'.repeat(24)}', source: 'command:schema' });
      if (!result.allowed) throw new Error('seed reservation failed');
      await tracker.close();
    `);
    assert.equal(seed.stderr, '');
    const file = path.join(dir, 'outbound-policy-state.json');
    const state = JSON.parse(await readFile(file, 'utf8'));
    state.lastSentAt = 'not-a-timestamp';
    const damaged = JSON.stringify(state, null, 2);
    await writeFile(file, damaged);
    const attempt = await runNode(dir, `
      ${trackerPrelude}
      try {
        await tracker.reserveOutbound({ recipientKey: '${'b'.repeat(24)}', fingerprint: '${'c'.repeat(24)}', source: 'command:schema' });
        process.exitCode = 2;
      } catch (error) {
        if (error.code !== 'WHISKAY_POLICY_STORE_CORRUPT') throw error;
        console.log('SCHEMA_FAIL_CLOSED');
      } finally { await tracker.close(); }
    `);
    assert.match(attempt.stdout, /SCHEMA_FAIL_CLOSED/);
    assert.equal(await readFile(file, 'utf8'), damaged);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('PM2 remains single Baileys instance and declares its process identity', async () => {
  const source = await readFile(new URL('../config/ecosystem.config.cjs', import.meta.url), 'utf8');
  const startup = await readFile(new URL('../scripts/start.mjs', import.meta.url), 'utf8');
  assert.match(source, /instances:\s*1/);
  assert.match(source, /exec_mode:\s*'fork'/);
  assert.match(startup, /acquireSingleInstanceLock\(\)/);
  assert.match(startup, /Startup kedua dibatalkan/);
});

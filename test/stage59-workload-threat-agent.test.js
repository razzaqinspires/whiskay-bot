import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { analyzeThreatSnapshot } from '../src/core/ThreatIntelligence.js';
import { ThreatWorkerPool } from '../src/core/ThreatWorkerPool.js';
import { WorkloadTracker } from '../src/core/WorkloadTracker.js';
import { OutboundTrafficGuard, runWithOutboundContext } from '../src/core/OutboundTrafficGuard.js';
import { WorkloadScheduler } from '../src/core/WorkloadScheduler.js';

function makeSocket() {
  const sent = [];
  return {
    sent,
    async sendMessage(jid, content) { sent.push({ jid, content }); return { key: { id: `m-${sent.length}` } }; },
    async relayMessage(jid, message) { sent.push({ jid, content: message }); return { key: { id: `r-${sent.length}` } }; },
  };
}

test('local threat scorer identifies source bursts and emits bounded recommendations', () => {
  const report = analyzeThreatSnapshot({
    generatedAt: 123,
    outbound: { count10s: 8, count60s: 18, recipientMax60s: 4, failureCount60s: 4, failureRatio60s: 0.4, duplicateBlocks60s: 5, bySource10: { 'command:legacy-burst': 8 } },
    commands: { maxPerActor60s: 18 },
    runtime: { cpuPercent: 20, heapPercent: 25, eventLoopDelayMs: 8, queueDepth: 1 },
    limits: { globalMaxPerMinute: 20, recipientMaxPerMinute: 4 },
  });
  assert.equal(report.state, 'CRITICAL');
  assert.equal(report.quarantineSources[0], 'command:legacy-burst');
  assert.equal(report.externalModelUsed, false);
  assert.ok(report.factors.some(item => item.key === 'source_burst_10s'));
  assert.ok(report.recommendations.length > 0);
});

test('worker_threads pool runs concurrent threat analysis and closes cleanly', async () => {
  const pool = new ThreatWorkerPool({ size: 2, maxQueue: 4, timeoutMs: 4000 });
  try {
    const snapshots = Array.from({ length: 4 }, (_, index) => ({
      generatedAt: index + 1,
      outbound: { count10s: index, count60s: index, recipientMax60s: 1, failureRatio60s: 0, duplicateBlocks60s: 0, bySource10: {} },
      commands: { maxPerActor60s: 0 }, runtime: {}, limits: {},
    }));
    const results = await Promise.all(snapshots.map(snapshot => pool.run(snapshot)));
    assert.equal(results.length, 4);
    assert.equal(pool.stats().size, 2);
    assert.equal(pool.stats().completed, 4);
    assert.equal(pool.stats().failed, 0);
  } finally {
    await pool.close();
  }
  assert.equal(pool.stats().closed, true);
});

test('tracker records commands as hashes and applies source quarantine after confirmed burst', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-stage59-'));
  const storageFile = path.join(root, 'workload-tracker.json');
  let now = 1_800_000_000_000;
  const tracker = new WorkloadTracker({
    now: () => now,
    storageFile,
    outboundGlobalMaxPerMinute: 8,
    outboundRecipientMaxPerMinute: 4,
    outboundDuplicateWindowMs: 30000,
    outboundMinIntervalMs: 0,
    threatQuarantineTtlMs: 60000,
    autoQuarantine: true,
  });
  try {
    for (let index = 0; index < 7; index++) {
      now += 500;
      const reservation = await tracker.reserveOutbound({
        recipientKey: index.toString(16).padStart(24, '0'),
        fingerprint: (index + 20).toString(16).padStart(24, '0'),
        source: 'command:legacy-burst',
      });
      assert.equal(reservation.allowed, true);
      await tracker.completeOutbound(reservation.id, 'sent');
    }
    for (let index = 0; index < 15; index++) {
      tracker.recordCommandExecution({ command: 'menu', actor: '628123456789@s.whatsapp.net', ok: true, durationMs: 10 });
    }
    const report = await tracker.analyzeThreat();
    assert.ok(report.score >= 60);
    assert.ok(tracker.getSourceQuarantine('command:legacy-burst'));
    await tracker.flush();
    const raw = await readFile(storageFile, 'utf8');
    assert.doesNotMatch(raw, /628123456789/);
    assert.doesNotMatch(raw, /message body|secret token/i);
    assert.match(raw, /"version"\s*:\s*2/);
  } finally {
    await tracker.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('outbound guard rejects quarantined sources before calling Baileys', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-stage59-guard-'));
  const tracker = new WorkloadTracker({ storageFile: path.join(root, 'telemetry.json') });
  const scheduler = new WorkloadScheduler({ concurrency: 1, minIntervalMs: 0, maxQueue: 5 });
  const guard = new OutboundTrafficGuard({ tracker, scheduler });
  const sock = makeSocket();
  try {
    await tracker.quarantineSource('command:unsafe-source', { ttlMs: 60000, reason: 'test quarantine' });
    guard.attach(sock);
    await assert.rejects(
      runWithOutboundContext({ source: 'command:unsafe-source' }, () => sock.sendMessage('628100000000@s.whatsapp.net', { text: 'must not send' })),
      error => error.code === 'WHISKAY_OUTBOUND_SOURCE_QUARANTINED',
    );
    assert.equal(sock.sent.length, 0);
    assert.equal(tracker.counters.outboundQuarantineBlocked, 1);
  } finally {
    await scheduler.close();
    await tracker.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('command and owner control integration records execution and exposes threat controls', async () => {
  const handler = await readFile(new URL('../src/core/CommandHandler.js', import.meta.url), 'utf8');
  const ownerPlugin = await readFile(new URL('../src/plugins/owner/workload.js', import.meta.url), 'utf8');
  const bot = await readFile(new URL('../src/core/Bot.js', import.meta.url), 'utf8');
  const env = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  const settings = await readFile(new URL('../src/config/settings.js', import.meta.url), 'utf8');
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(handler, /beginCommandInvocation\(/);
  assert.match(handler, /finishCommandInvocation\(/);
  assert.match(ownerPlugin, /clear-quarantine/);
  assert.match(ownerPlugin, /workloadTracker\.analyzeThreat/);
  assert.match(ownerPlugin, /Threat Agent berjalan lokal dalam worker_threads/);
  assert.match(bot, /workloadTracker\.startThreatMonitoring\(/);
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, lock.version);
  assert.equal(pkg.version, lock.packages[''].version);
  assert.ok(Number(pkg.version.split('.')[2]) >= 26, 'package must retain the Stage 61+ release lineage');
  assert.match(pkg.scripts['verify:all'], /verify:stage59/);
  assert.match(env, /WHISKAY_THREAT_AGENT_ENABLED=true/);
  assert.match(settings, /WHISKAY_THREAT_QUARANTINE_TTL_MS/);
});

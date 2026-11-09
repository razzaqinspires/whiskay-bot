import os from 'node:os';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { getWorkloadShard } from './WorkloadCortex.js';
import { ThreatWorkerPool } from './ThreatWorkerPool.js';
import { OutboundPolicyStore } from './OutboundPolicyStore.js';
import { withFileLock, writeJsonAtomic } from '../utils/PersistentJsonStore.js';

const ROOT = path.resolve(process.env.WHISKAY_DATA_DIR || 'data');
const INSTANCE_ID = String(process.env.WHISKAY_INSTANCE_ID || process.env.NODE_APP_INSTANCE || 'primary').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 40) || 'primary';
const FILE = path.join(ROOT, `workload-tracker-${INSTANCE_ID}.json`);
const LEGACY_FILE = path.join(ROOT, 'workload-tracker.json');
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const cleanSource = value => String(value || 'background:unattributed').toLowerCase().replace(/[^a-z0-9:_-]/g, '_').slice(0, 80);
const hashIdentity = value => createHash('sha256').update(String(value || 'unknown')).digest('hex').slice(0, 24);
const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
};
const integerEnv = (name, fallback, min, max) => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? clamp(Math.floor(value), min, max) : fallback;
};

/**
 * Runtime telemetry and deterministic outbound-abuse risk scoring.
 * No message bodies or raw WhatsApp JIDs are retained by this tracker.
 */
export class WorkloadTracker {
  constructor({
    windowSize = 120,
    now = () => Date.now(),
    cpuUsage = () => process.cpuUsage(),
    memoryUsage = () => process.memoryUsage(),
    cores = Math.max(1, os.cpus()?.length || 1),
    outboundGlobalMaxPerMinute = integerEnv('WHISKAY_OUTBOUND_GLOBAL_MAX_PER_MINUTE', 20, 2, 120),
    outboundRecipientMaxPerMinute = integerEnv('WHISKAY_OUTBOUND_RECIPIENT_MAX_PER_MINUTE', 4, 1, 30),
    outboundDuplicateWindowMs = integerEnv('WHISKAY_OUTBOUND_DUPLICATE_WINDOW_MS', 30000, 5000, 3600000),
    outboundMinIntervalMs = integerEnv('WHISKAY_OUTBOUND_MIN_INTERVAL_MS', 2000, 0, 30000),
    storageFile = FILE,
    sharedPolicyFile = null,
    threatWorkerPool = null,
    threatIntervalMs = integerEnv('WHISKAY_THREAT_INTERVAL_MS', 10000, 3000, 60000),
    threatQuarantineTtlMs = integerEnv('WHISKAY_THREAT_QUARANTINE_TTL_MS', 60000, 10000, 3600000),
    autoQuarantine = String(process.env.WHISKAY_THREAT_AUTO_QUARANTINE ?? 'true').toLowerCase() !== 'false',
  } = {}) {
    this.file = path.resolve(storageFile);
    this.legacyFile = this.file === path.resolve(FILE) ? path.resolve(LEGACY_FILE) : null;
    const policyFile = sharedPolicyFile || (path.resolve(storageFile) === path.resolve(FILE)
      ? path.join(ROOT, 'outbound-policy-state.json')
      : `${path.resolve(storageFile)}.outbound-policy-state.json`);
    this.outboundStore = new OutboundPolicyStore({ file: policyFile, now });
    this.windowSize = clamp(windowSize, 10, 600);
    this.now = now;
    this.cpuUsage = cpuUsage;
    this.memoryUsage = memoryUsage;
    this.cores = cores;
    this.previous = null;
    this.samples = [];
    this.commandSamples = new Map();
    this.commandEvents = [];
    this.commandSequence = 0;
    this.blockedOutboundEvents = [];
    this.quarantines = new Map();
    this.active = new Map();
    this.queueDepth = 0;
    this.counters = {
      tasksStarted: 0, tasksCompleted: 0, tasksFailed: 0, tasksRejected: 0,
      networkTasks: 0, aiTasks: 0, heavyTasks: 0, bytesObserved: 0,
      outboundAttempts: 0, outboundAccepted: 0, outboundBlocked: 0,
      outboundFailed: 0, outboundDuplicateBlocked: 0, outboundQuarantineBlocked: 0,
    };
    this.outboundPolicy = {
      globalMaxPerMinute: outboundGlobalMaxPerMinute,
      recipientMaxPerMinute: outboundRecipientMaxPerMinute,
      duplicateWindowMs: outboundDuplicateWindowMs,
      minIntervalMs: outboundMinIntervalMs,
    };
    this.outboundEvents = [];
    this.outboundSequence = 0;
    this.lastOutboundRisk = { score: 0, state: 'NORMAL', reason: 'no outbound samples' };
    this.delay = monitorEventLoopDelay({ resolution: 20 });
    this.delay.enable();
    this.persistQueue = Promise.resolve();
    this.persistTimer = null;
    this.persistPending = false;
    this.persistIntervalMs = 3000;
    this.loaded = false;
    this.threatWorkerPool = threatWorkerPool || new ThreatWorkerPool();
    this.threatIntervalMs = threatIntervalMs;
    this.threatQuarantineTtlMs = threatQuarantineTtlMs;
    this.autoQuarantine = autoQuarantine;
    this.threatTimer = null;
    this.threatAnalysisRunning = false;
    this.lastThreatReport = { score: 0, state: 'NORMAL', factors: [], recommendations: ['Threat monitoring has not produced a report yet.'], quarantineSources: [], engine: 'local-feature-agent-v1', externalModelUsed: false };
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      let raw;
      try { raw = await readFile(this.file, 'utf8'); }
      catch (error) {
        if (error?.code !== 'ENOENT' || !this.legacyFile) throw error;
        raw = await readFile(this.legacyFile, 'utf8');
      }
      const value = JSON.parse(raw);
      if ([1, 2].includes(value?.version)) {
        this.counters = { ...this.counters, ...value.counters };
        this.commandSamples = new Map(Object.entries(value.commands || {}).map(([key, rows]) => [
          key,
          Array.isArray(rows) ? rows.slice(-this.windowSize) : [],
        ]));
        const retentionMs = Math.max(60_000, this.outboundPolicy.duplicateWindowMs);
        const cutoff = this.now() - retentionMs;
        this.outboundEvents = (Array.isArray(value.outboundRecent) ? value.outboundRecent : [])
          .filter(row => Number.isFinite(Number(row?.at)) && Number(row.at) >= cutoff &&
            /^[a-f0-9]{24}$/.test(String(row?.recipientKey || '')) &&
            (!row.fingerprint || /^[a-f0-9]{24}$/.test(String(row.fingerprint))))
          .slice(-5000)
          .map(row => ({
            id: Number(row.id) || ++this.outboundSequence,
            at: Number(row.at),
            recipientKey: String(row.recipientKey),
            fingerprint: String(row.fingerprint || ''),
            source: String(row.source || 'background:unattributed').slice(0, 80),
            outcome: ['queued', 'started', 'sent', 'failed'].includes(row.outcome) ? row.outcome : 'sent',
          }));
        this.outboundSequence = Math.max(this.outboundSequence, ...this.outboundEvents.map(row => row.id), 0);
        if (value.version >= 2) {
          this.commandEvents = (Array.isArray(value.commandEvents) ? value.commandEvents : []).filter(row =>
            Number.isFinite(Number(row?.at)) && Number(row.at) >= this.now() - 300000 &&
            /^[a-f0-9]{24}$/.test(String(row?.actorKey || '')) && /^[a-z0-9_-]{1,48}$/.test(String(row?.command || ''))
          ).slice(-5000).map(row => ({ id: Number(row.id) || ++this.commandSequence, at: Number(row.at), actorKey: String(row.actorKey), command: String(row.command), outcome: ['running','failed'].includes(row.outcome) ? row.outcome : 'completed', durationMs: Math.max(0, Number(row.durationMs) || 0) }));
          this.commandSequence = Math.max(this.commandSequence, ...this.commandEvents.map(row => row.id), 0);
          this.blockedOutboundEvents = (Array.isArray(value.blockedOutboundRecent) ? value.blockedOutboundRecent : []).filter(row =>
            Number.isFinite(Number(row?.at)) && Number(row.at) >= this.now() - 300000 && /^[a-z0-9:_-]{1,80}$/.test(String(row?.source || ''))
          ).slice(-1000).map(row => ({ at: Number(row.at), source: String(row.source), reason: String(row.reason || 'policy-block').slice(0, 80), recipientKey: /^[a-f0-9]{24}$/.test(String(row.recipientKey || '')) ? String(row.recipientKey) : '' }));
          this.lastThreatReport = value.threatReport && ['NORMAL','ELEVATED','HIGH','CRITICAL'].includes(value.threatReport.state) ? value.threatReport : this.lastThreatReport;
          for (const entry of Array.isArray(value.quarantines) ? value.quarantines : []) {
            if (/^[a-z0-9:_-]{1,80}$/.test(String(entry?.source || '')) && Number(entry.expiresAt) > this.now()) this.quarantines.set(String(entry.source), { expiresAt: Number(entry.expiresAt), reason: String(entry.reason || 'threat-policy').slice(0, 120) });
          }
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') console.error('[WORKLOAD TRACKER] persisted telemetry ignored:', error.message);
    }
  }

  persist({ immediate = false } = {}) {
    if (!immediate) {
      this.persistPending = true;
      if (!this.persistTimer) {
        this.persistTimer = setTimeout(() => {
          this.persistTimer = null;
          if (!this.persistPending) return;
          this.persistPending = false;
          this.persist({ immediate: true }).catch(() => {});
        }, this.persistIntervalMs);
        this.persistTimer.unref?.();
      }
      return Promise.resolve({ scheduled: true });
    }

    const retentionMs = Math.max(60_000, this.outboundPolicy.duplicateWindowMs);
    const cutoff = this.now() - retentionMs;
    this.outboundEvents = this.outboundEvents.filter(event => event.at >= cutoff).slice(-5000);
    const data = {
      version: 2,
      updatedAt: this.now(),
      counters: this.counters,
      commands: Object.fromEntries([...this.commandSamples].map(([key, rows]) => [key, rows.slice(-this.windowSize)])),
      // Only short one-way hashes and timestamps are persisted; never raw JIDs or message bodies.
      outboundRecent: this.outboundEvents.map(({ id, at, recipientKey, fingerprint, source, outcome }) => ({ id, at, recipientKey, fingerprint, source, outcome })),
      commandEvents: this.commandEvents.slice(-5000),
      blockedOutboundRecent: this.blockedOutboundEvents.slice(-1000),
      threatReport: this.lastThreatReport,
      quarantines: [...this.quarantines.entries()].filter(([, value]) => value.expiresAt > this.now()).map(([source, value]) => ({ source, ...value })),
    };
    const run = this.persistQueue.then(() => withFileLock(`${this.file}.lock`, async () => {
      await writeJsonAtomic(this.file, data);
    }));
    this.persistQueue = run.catch(error => console.error('[WORKLOAD TRACKER] persist:', error.message));
    return run;
  }

  async flush() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    const needsWrite = this.persistPending;
    this.persistPending = false;
    if (needsWrite) await this.persist({ immediate: true });
    await this.persistQueue;
  }

  sample({ queueDepth = this.queueDepth, activeWorkers = this.active.size } = {}) {
    const now = this.now();
    const cpu = this.cpuUsage();
    const memory = this.memoryUsage();
    let cpuPercent = 0;
    if (this.previous) {
      const elapsed = Math.max(1, (now - this.previous.at) * 1000);
      const used = Math.max(0, (cpu.user - this.previous.cpu.user) + (cpu.system - this.previous.cpu.system));
      cpuPercent = clamp((used / elapsed / this.cores) * 100, 0, 100);
    }
    this.previous = { at: now, cpu };
    const lag = Math.max(0, this.delay.mean / 1e6 || 0);
    const shard = getWorkloadShard({
      cpuPercent,
      heapUsedMB: memory.heapUsed / 1048576,
      heapTotalMB: memory.heapTotal / 1048576,
      queueDepth,
      activeWorkers,
      eventLoopDelayMs: lag,
    });
    const result = {
      at: now,
      cpuPercent: Math.round(cpuPercent * 10) / 10,
      heapPercent: Math.round((memory.heapUsed / Math.max(1, memory.heapTotal)) * 1000) / 10,
      heapUsedMB: Math.round((memory.heapUsed / 1048576) * 10) / 10,
      rssMB: Math.round((memory.rss / 1048576) * 10) / 10,
      queueDepth,
      activeWorkers,
      eventLoopDelayMs: Math.round(lag * 10) / 10,
      state: shard.state,
      score: shard.score,
    };
    this.samples.push(result);
    if (this.samples.length > this.windowSize) this.samples.shift();
    return { ...result };
  }

  beginTask(id, kind = 'simple') {
    const key = String(id);
    this.active.set(key, { at: this.now(), kind });
    this.recordTask(kind, 'started');
    return key;
  }

  finishTask(id, { ok = true, responseBytes = 0 } = {}) {
    const task = this.active.get(String(id));
    if (!task) return null;
    this.active.delete(String(id));
    const durationMs = Math.max(0, this.now() - task.at);
    const responseSize = Math.max(0, Number(responseBytes) || 0);
    this.recordTask(task.kind, ok ? 'completed' : 'failed');
    this.counters.bytesObserved += responseSize;
    this.persist().catch(() => {});
    return { durationMs, responseBytes: responseSize };
  }

  recordCommand(command, metrics = {}) {
    const key = String(command || 'unknown').toLowerCase();
    const rows = this.commandSamples.get(key) || [];
    rows.push({
      durationMs: Math.max(0, Number(metrics.durationMs) || 0),
      responseBytes: Math.max(0, Number(metrics.responseBytes) || 0),
      at: this.now(),
    });
    this.commandSamples.set(key, rows.slice(-this.windowSize));
    this.counters.bytesObserved += Math.max(0, Number(metrics.responseBytes) || 0);
    this.persist().catch(() => {});
  }

  commandProfile(command) {
    const rows = this.commandSamples.get(String(command || '').toLowerCase()) || [];
    const durations = rows.map(row => row.durationMs);
    const bytes = rows.map(row => row.responseBytes);
    return {
      samples: rows.length,
      p50Ms: Math.round(percentile(durations, 0.5)),
      p95Ms: Math.round(percentile(durations, 0.95)),
      averageResponseKB: Math.round((bytes.reduce((sum, value) => sum + value, 0) / Math.max(1, bytes.length)) / 1024 * 100) / 100,
    };
  }

  beginCommandInvocation({ command = 'unknown', actor = 'unknown' } = {}) {
    const name = String(command || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48) || 'unknown';
    const id = ++this.commandSequence;
    this.commandEvents.push({ id, at: this.now(), actorKey: hashIdentity(actor), command: name, outcome: 'running', durationMs: 0 });
    if (this.commandEvents.length > 5000) this.commandEvents.splice(0, this.commandEvents.length - 5000);
    this.persist().catch(() => {});
    return id;
  }

  finishCommandInvocation(id, { ok = true, durationMs = 0 } = {}) {
    const event = this.commandEvents.find(row => row.id === Number(id));
    if (!event || event.outcome !== 'running') return false;
    event.outcome = ok ? 'completed' : 'failed';
    event.durationMs = Math.max(0, Number(durationMs) || 0);
    this.persist().catch(() => {});
    return true;
  }

  recordCommandExecution({ command = 'unknown', actor = 'unknown', ok = true, durationMs = 0 } = {}) {
    const id = this.beginCommandInvocation({ command, actor });
    this.finishCommandInvocation(id, { ok, durationMs });
    return id;
  }

  async quarantineSource(source, { ttlMs = this.threatQuarantineTtlMs, reason = 'high-confidence-source-burst' } = {}) {
    const key = cleanSource(source);
    if (!key || key === 'background:unattributed') return false;
    const entry = { expiresAt: this.now() + clamp(ttlMs, 10000, 3600000), reason: String(reason).slice(0, 120) };
    this.quarantines.set(key, entry);
    await this.outboundStore.quarantine(key, { ttlMs, reason });
    this.persist().catch(() => {});
    return true;
  }

  getSourceQuarantine(source) {
    const key = cleanSource(source);
    const entry = this.quarantines.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.quarantines.delete(key);
      this.persist().catch(() => {});
      return null;
    }
    return { source: key, ...entry, remainingMs: entry.expiresAt - this.now() };
  }

  async clearSourceQuarantines() {
    const count = await this.outboundStore.clearQuarantines();
    this.quarantines.clear();
    this.persist().catch(() => {});
    return count;
  }

  activeQuarantines() {
    const result = [];
    for (const source of this.quarantines.keys()) {
      const entry = this.getSourceQuarantine(source);
      if (entry) result.push(entry);
    }
    return result;
  }

  async sharedQuarantines() {
    const rows = await this.outboundStore.listQuarantines();
    this.quarantines = new Map(rows.map(row => [row.source, { expiresAt: row.expiresAt, reason: row.reason }]));
    return rows;
  }

  createThreatSnapshot({ queueDepth = 0, activeWorkers = 0, sharedOutboundEvents = null, sharedBlockedEvents = null } = {}) {
    const now = this.now();
    const outboundRows = Array.isArray(sharedOutboundEvents) ? sharedOutboundEvents : this.outboundEvents;
    const blockedRows = Array.isArray(sharedBlockedEvents) ? sharedBlockedEvents : this.blockedOutboundEvents;
    const outbound5m = outboundRows.filter(event => event.at >= now - 300000);
    const outbound60 = outbound5m.filter(event => event.at >= now - 60000);
    const outbound10 = outbound5m.filter(event => event.at >= now - 10000);
    const outboundBuckets10s = Array.from({ length: 30 }, (_, index) => outbound5m.filter(event => {
      const bucket = Math.floor((now - event.at) / 10000);
      return bucket === index;
    }).length);
    const recipientCounts = new Map();
    for (const event of outbound60) recipientCounts.set(event.recipientKey, (recipientCounts.get(event.recipientKey) || 0) + 1);
    const bySource10 = {};
    for (const event of outbound10) bySource10[event.source] = (bySource10[event.source] || 0) + 1;
    const failures = outbound60.filter(event => event.outcome === 'failed').length;
    const blocked60 = blockedRows.filter(event => event.at >= now - 60000);
    const commands5m = this.commandEvents.filter(event => event.at >= now - 300000);
    const commands60 = commands5m.filter(event => event.at >= now - 60000);
    const actorCounts = new Map();
    const commandCounts = new Map();
    const commandBuckets10s = Array.from({ length: 30 }, (_, index) => commands5m.filter(event => Math.floor((now - event.at) / 10000) === index).length);
    for (const event of commands60) {
      actorCounts.set(event.actorKey, (actorCounts.get(event.actorKey) || 0) + 1);
      commandCounts.set(event.command, (commandCounts.get(event.command) || 0) + 1);
    }
    const sample = this.samples.at(-1) || this.sample({ queueDepth, activeWorkers });
    return {
      generatedAt: now,
      outbound: {
        count10s: outbound10.length,
        count60s: outbound60.length,
        count5m: outbound5m.length,
        uniqueRecipients60s: recipientCounts.size,
        recipientMax60s: Math.max(0, ...recipientCounts.values()),
        failureCount60s: failures,
        failureRatio60s: outbound60.length ? failures / outbound60.length : 0,
        duplicateBlocks60s: blocked60.filter(event => event.reason === 'duplicate-payload-window').length,
        bySource10,
        buckets10s: outboundBuckets10s,
      },
      commands: {
        count60s: commands60.length,
        uniqueActors60s: actorCounts.size,
        maxPerActor60s: Math.max(0, ...actorCounts.values()),
        maxPerCommand60s: Math.max(0, ...commandCounts.values()),
        buckets10s: commandBuckets10s,
        failed60s: commands60.filter(event => event.outcome === 'failed').length,
      },
      runtime: {
        cpuPercent: sample.cpuPercent,
        heapPercent: sample.heapPercent,
        eventLoopDelayMs: sample.eventLoopDelayMs,
        queueDepth: Math.max(0, Number(queueDepth) || 0),
        activeWorkers: Math.max(0, Number(activeWorkers) || 0),
      },
      limits: { ...this.outboundPolicy },
    };
  }

  async analyzeThreat({ queueDepth = 0, activeWorkers = 0 } = {}) {
    const shared = await this.outboundStore.snapshot();
    const snapshot = this.createThreatSnapshot({ queueDepth, activeWorkers,
      sharedOutboundEvents: shared.events, sharedBlockedEvents: shared.blockedRecent });
    const report = await this.threatWorkerPool.run(snapshot);
    this.lastThreatReport = report;
    if (this.autoQuarantine) {
      for (const source of report.quarantineSources || []) {
        await this.quarantineSource(source, { reason: `auto:${(report.factors || []).map(factor => factor.key).join(',').slice(0, 80)}` });
      }
    }
    this.persist().catch(() => {});
    return report;
  }

  startThreatMonitoring({ intervalMs = this.threatIntervalMs, queueProvider = null } = {}) {
    if (String(process.env.WHISKAY_THREAT_AGENT_ENABLED ?? 'true').toLowerCase() === 'false') return false;
    if (this.threatTimer) return false;
    const execute = async () => {
      if (this.threatAnalysisRunning) return;
      this.threatAnalysisRunning = true;
      try {
        const state = typeof queueProvider === 'function' ? queueProvider() || {} : {};
        await this.analyzeThreat(state);
      } catch (error) {
        this.lastThreatReport = { ...this.lastThreatReport, lastError: String(error?.message || error).slice(0, 180), lastErrorAt: this.now() };
      } finally {
        this.threatAnalysisRunning = false;
      }
    };
    this.threatTimer = setInterval(execute, clamp(intervalMs, 3000, 60000));
    this.threatTimer.unref?.();
    execute().catch(() => {});
    return true;
  }

  threatStats() {
    const quarantines = this.activeQuarantines();
    return {
      enabled: String(process.env.WHISKAY_THREAT_AGENT_ENABLED ?? 'true').toLowerCase() !== 'false',
      monitoring: Boolean(this.threatTimer),
      analysisRunning: this.threatAnalysisRunning,
      autoQuarantine: this.autoQuarantine,
      lastReport: this.lastThreatReport,
      quarantines,
      workers: this.threatWorkerPool.stats(),
    };
  }

  async sharedThreatStats() {
    const quarantines = await this.sharedQuarantines();
    return { ...this.threatStats(), quarantines };
  }

  recordOutboundPolicyBlock({ source = 'background:unattributed', reason = 'policy-block', recipientKey = '' } = {}) {
    this.counters.outboundBlocked++;
    if (String(reason).includes('quarantine')) this.counters.outboundQuarantineBlocked++;
    if (String(reason).includes('duplicate')) this.counters.outboundDuplicateBlocked++;
    this.blockedOutboundEvents.push({
      at: this.now(),
      source: cleanSource(source),
      reason: String(reason).slice(0, 80),
      recipientKey: /^[a-f0-9]{24}$/.test(String(recipientKey || '')) ? String(recipientKey) : '',
    });
    if (this.blockedOutboundEvents.length > 1000) this.blockedOutboundEvents.splice(0, this.blockedOutboundEvents.length - 1000);
    this.persist().catch(() => {});
  }

  /** Cross-process reservation: one shared host policy controls every bot worker. */
  async reserveOutbound({ recipientKey, fingerprint = '', source = 'unattributed', queueDepth = 0 } = {}) {
    const now = this.now();
    const decision = await this.outboundStore.reserve({
      recipientKey, fingerprint, source,
      globalMaxPerMinute: this.outboundPolicy.globalMaxPerMinute,
      recipientMaxPerMinute: this.outboundPolicy.recipientMaxPerMinute,
      duplicateWindowMs: this.outboundPolicy.duplicateWindowMs,
      minIntervalMs: this.outboundPolicy.minIntervalMs,
      queueDepth,
    });
    this.lastOutboundRisk = { ...decision, reason: decision.reason || 'allowed' };
    if (!decision.allowed) {
      this.counters.outboundBlocked++;
      if (decision.reason === 'duplicate-payload-window') this.counters.outboundDuplicateBlocked++;
      if (decision.reason === 'source-quarantine') this.counters.outboundQuarantineBlocked++;
      this.blockedOutboundEvents.push({ at: now, source: cleanSource(source), reason: decision.reason, recipientKey: String(recipientKey || '') });
      if (this.blockedOutboundEvents.length > 1000) this.blockedOutboundEvents.splice(0, this.blockedOutboundEvents.length - 1000);
      this.persist().catch(() => {});
      return decision;
    }

    this.outboundEvents.push({ id: decision.id, at: now, recipientKey: String(recipientKey), fingerprint: String(fingerprint || ''), source: cleanSource(source), outcome: 'queued' });
    if (this.outboundEvents.length > 5000) this.outboundEvents.splice(0, this.outboundEvents.length - 5000);
    this.counters.outboundAttempts++;
    return decision;
  }

  async startOutbound(id) {
    try {
      const result = await this.outboundStore.start(id, {
        minIntervalMs: this.outboundPolicy.minIntervalMs,
        globalMaxPerMinute: this.outboundPolicy.globalMaxPerMinute,
        recipientMaxPerMinute: this.outboundPolicy.recipientMaxPerMinute,
        duplicateWindowMs: this.outboundPolicy.duplicateWindowMs,
        reservationMaxAgeMs: 120000,
      });
      const event = this.outboundEvents.find(row => row.id === String(id));
      if (event && event.outcome === 'queued') event.outcome = 'started';
      return result;
    } catch (error) {
      if (['WHISKAY_OUTBOUND_SOURCE_QUARANTINED', 'WHISKAY_OUTBOUND_FINAL_POLICY_BLOCKED'].includes(error?.code)) {
        this.recordOutboundPolicyBlock({
          source: this.outboundEvents.find(row => row.id === String(id))?.source || 'background:unattributed',
          reason: error?.policy?.reason || 'source-quarantine-before-send',
        });
        const event = this.outboundEvents.find(row => row.id === String(id));
        if (event && event.outcome === 'queued') event.outcome = 'failed';
      }
      throw error;
    }
  }

  async completeOutbound(id, outcome = 'sent') {
    const key = String(id || '');
    const updated = await this.outboundStore.complete(key, outcome);
    const event = this.outboundEvents.find(row => row.id === key);
    if (event && ['queued', 'started'].includes(event.outcome)) event.outcome = outcome === 'sent' ? 'sent' : 'failed';
    if (updated) {
      if (outcome === 'sent') { this.counters.outboundAccepted++; }
      else { this.counters.outboundFailed++; }
      this.persist().catch(() => {});
    }
    return updated;
  }

  outboundStats() {
    const now = this.now();
    const recent = this.outboundEvents.filter(event => event.at >= now - 60_000);
    const bySource = new Map();
    for (const event of recent) bySource.set(event.source, (bySource.get(event.source) || 0) + 1);
    return {
      windowMs: 60_000,
      recentAttempts: recent.length,
      recentSources: Object.fromEntries([...bySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)),
      policy: { ...this.outboundPolicy },
      lastRisk: { ...this.lastOutboundRisk },
      counters: {
        attempts: this.counters.outboundAttempts,
        accepted: this.counters.outboundAccepted,
        blocked: this.counters.outboundBlocked,
        duplicatesBlocked: this.counters.outboundDuplicateBlocked,
        quarantineBlocked: this.counters.outboundQuarantineBlocked,
        failed: this.counters.outboundFailed,
      },
    };
  }

  recordTask(kind = 'simple', outcome = 'started') {
    const taskCounters = { network: 'networkTasks', ai: 'aiTasks', heavy: 'heavyTasks' };
    if (outcome === 'started') this.counters.tasksStarted++;
    if (outcome === 'completed') this.counters.tasksCompleted++;
    if (outcome === 'failed') this.counters.tasksFailed++;
    if (outcome === 'rejected') this.counters.tasksRejected++;
    if (taskCounters[kind] && outcome === 'started') this.counters[taskCounters[kind]]++;
    return { ...this.counters };
  }

  stats() {
    const last = this.samples.at(-1) || this.sample();
    const average = key => this.samples.length
      ? Math.round((this.samples.reduce((sum, row) => sum + row[key], 0) / this.samples.length) * 10) / 10
      : 0;
    return {
      instanceId: INSTANCE_ID,
      current: last,
      samples: this.samples.length,
      windowSize: this.windowSize,
      averageCpuPercent: average('cpuPercent'),
      averageHeapPercent: average('heapPercent'),
      activeTasks: this.active.size,
      counters: { ...this.counters },
      outbound: this.outboundStats(),
      threat: this.threatStats(),
    };
  }

  async close() {
    this.delay.disable();
    if (this.threatTimer) clearInterval(this.threatTimer);
    this.threatTimer = null;
    await this.threatWorkerPool.close().catch(() => {});
    await this.flush();
  }
}

export const workloadTracker = new WorkloadTracker();

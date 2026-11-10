import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { WorkloadScheduler } from './WorkloadScheduler.js';
import { workloadTracker } from './WorkloadTracker.js';

const outboundContext = new AsyncLocalStorage();
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const integerEnv = (name, fallback, min, max) => clamp(process.env[name] ?? fallback, min, max);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const VOLATILE_KEYS = new Set([
  'contextInfo', 'messageContextInfo', 'mediaKey', 'fileEncSha256', 'directPath',
  'jpegThumbnail', 'thumbnail', 'streamingSidecar', 'waveform', 'messageTimestamp',
  'senderTimestampMs', 'stanzaId', 'participant', 'remoteJid', 'mentionedJid',
]);
const MEDIA_KEYS = new Set(['image', 'video', 'audio', 'document', 'sticker', 'imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage']);
const hash = value => createHash('sha256').update(value).digest('hex');
const shortHash = value => hash(String(value)).slice(0, 24);

function normalizeSource(value) {
  const source = String(value || '').trim().toLowerCase().replace(/[^a-z0-9:_-]/g, '_').slice(0, 80);
  if (!source || source === 'unattributed' || source === 'background:unattributed') return '';
  return source;
}

export function runWithOutboundContext(context, callback) {
  if (typeof callback !== 'function') throw new TypeError('Outbound context callback must be a function.');
  const source = normalizeSource(context?.source);
  if (!source) {
    const error = new Error('Outbound source attribution is required.');
    error.code = 'WHISKAY_OUTBOUND_SOURCE_REQUIRED';
    throw error;
  }
  return outboundContext.run({ ...context, source }, callback);
}

function binaryDescriptor(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    return { length: bytes.length, sha256: hash(bytes) };
  }
  if (value instanceof ArrayBuffer) {
    const bytes = Buffer.from(value);
    return { length: bytes.length, sha256: hash(bytes) };
  }
  return null;
}

/**
 * Build a stable, privacy-preserving semantic fingerprint. Binary media is keyed by
 * content bytes; Baileys media messages use their source fileSha256 when available.
 * Unknown media deliberately returns no fingerprint instead of collapsing every
 * image/video/document of the same type into one false duplicate.
 */
export function messageFingerprint(content) {
  if (!content || typeof content !== 'object') return '';
  if (content.delete || content.reaction || content.protocolMessage || content.senderKeyDistributionMessage) return '';
  const root = content.message && typeof content.message === 'object' ? content.message : content;
  const state = { mediaDetected: false, mediaEvidence: false, nodes: 0 };

  const project = (value, key = '', depth = 0) => {
    if (depth > 8 || state.nodes++ > 300) return undefined;
    const binary = binaryDescriptor(value);
    if (binary) {
      if (MEDIA_KEYS.has(key) || key === 'fileSha256' || key === 'file') state.mediaEvidence = true;
      return { binary };
    }
    if (value === null || value === undefined) return value === null ? null : undefined;
    if (typeof value === 'string') {
      if (key === 'fileSha256' && value.trim()) { state.mediaEvidence = true; return { fileSha256: hash(value.trim()) }; }
      if (key === 'url' && /^https?:\/\//i.test(value)) { state.mediaEvidence = true; return { url: hash(value.trim()) }; }
      return value.length > 4000 ? value.slice(0, 4000) : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 80).map(item => project(item, key, depth + 1)).filter(item => item !== undefined);
    if (typeof value !== 'object') return undefined;

    const out = {};
    for (const name of Object.keys(value).sort().slice(0, 120)) {
      if (VOLATILE_KEYS.has(name)) continue;
      const child = value[name];
      if (MEDIA_KEYS.has(name)) state.mediaDetected = true;
      if (name === 'fileSha256' && child != null) {
        const encoded = Buffer.isBuffer(child) || child instanceof Uint8Array ? Buffer.from(child).toString('base64') : String(child);
        state.mediaEvidence = true; out[name] = hash(encoded); continue;
      }
      // A URL is a usable stable identity only when it is an explicit payload URL.
      if (name === 'url' && typeof child === 'string' && /^https?:\/\//i.test(child)) {
        state.mediaEvidence = true; out[name] = hash(child.trim()); continue;
      }
      const projected = project(child, name, depth + 1);
      if (projected !== undefined) out[name] = projected;
    }
    return out;
  };

  const canonical = project(root);
  if (state.mediaDetected && !state.mediaEvidence) return '';
  const serialized = JSON.stringify(canonical);
  if (!serialized || serialized === '{}' || serialized === '[]') return '';
  return hash(serialized).slice(0, 24);
}

/**
 * Observes every Baileys sendMessage call and applies bounded queueing,
 * exact-duplicate suppression, per-recipient/global limits and telemetry.
 * This is a compliance/stability control, not a method to evade WhatsApp enforcement.
 */
export class OutboundTrafficGuard {
  constructor({ tracker = workloadTracker, scheduler = null } = {}) {
    this.tracker = tracker;
    this.scheduler = scheduler || new WorkloadScheduler({
      concurrency: integerEnv('WHISKAY_OUTBOUND_WORKERS', 2, 1, 2),
      perLaneConcurrency: 1,
      minIntervalMs: integerEnv('WHISKAY_OUTBOUND_MIN_INTERVAL_MS', 2000, 1000, 30000),
      maxQueue: integerEnv('WHISKAY_OUTBOUND_QUEUE_MAX', 150, 5, 500),
    });
    this.attached = new WeakSet();
  }

  attach(sock) {
    if (!sock || typeof sock.sendMessage !== 'function') throw new TypeError('Socket Baileys tidak memiliki sendMessage().');
    if (this.attached.has(sock)) return sock;
    const originalSend = sock.sendMessage.bind(sock);
    const originalRelay = typeof sock.relayMessage === 'function' ? sock.relayMessage.bind(sock) : null;
    const guard = this;
    sock.sendMessage = function guardedSendMessage(jid, content, options) {
      return guard.send(originalSend, jid, content, options);
    };
    if (originalRelay) {
      sock.relayMessage = function guardedRelayMessage(jid, message, options) {
        return guard.send((destination, payload, opts) => originalRelay(destination, payload.message, opts), jid, { message }, options);
      };
    }
    this.attached.add(sock);
    return sock;
  }

  async send(originalSend, jid, content, options) {
    const destination = String(jid || '').trim();
    if (!destination || !/@/.test(destination)) throw new TypeError('Outbound recipient JID tidak valid.');
    const context = outboundContext.getStore();
    const source = normalizeSource(context?.source);
    if (!source) {
      const error = new Error('Outbound send rejected: explicit source attribution is required.');
      error.code = 'WHISKAY_OUTBOUND_SOURCE_REQUIRED';
      throw error;
    }
    const recipientKey = shortHash(destination);
    const fingerprint = messageFingerprint(content);
    // The persistent reservation is the canonical cross-process gate. It checks
    // shared rate windows, duplicate fingerprints, and source quarantine atomically.
    const decision = await this.tracker.reserveOutbound({
      recipientKey,
      fingerprint,
      source,
      queueDepth: this.scheduler.queueDepth,
    });
    if (!decision.allowed) {
      const quarantined = decision.reason === 'source-quarantine';
      const error = new Error(quarantined
        ? `Outbound source quarantined by threat policy for ${Math.ceil((decision.remainingMs || 0) / 1000)}s.`
        : `Outbound message blocked by policy: ${decision.reason} (risk ${decision.score}/100).`);
      error.code = quarantined ? 'WHISKAY_OUTBOUND_SOURCE_QUARANTINED' : 'WHISKAY_OUTBOUND_POLICY_BLOCKED';
      error.policy = decision;
      throw error;
    }

    return this.scheduler.enqueue({
      lane: `wa:${recipientKey}`,
      kind: 'network',
      metadata: { source, riskScore: decision.score },
      run: async () => {
        try {
          await this.tracker.startOutbound(decision.id);
          const result = await originalSend(destination, content, options);
          await this.tracker.completeOutbound(decision.id, 'sent');
          return result;
        } catch (error) {
          await this.tracker.completeOutbound(decision.id, 'failed').catch(() => {});
          throw error;
        }
      },
    }).catch(async error => {
      await this.tracker.completeOutbound(decision.id, 'failed').catch(() => {});
      throw error;
    });
  }

  async waitForIdle({ timeoutMs = 5000 } = {}) {
    return this.scheduler.waitForIdle({ timeoutMs });
  }

  stats() {
    return this.scheduler.stats();
  }

  async close() {
    await this.scheduler.close({ cancelPending: true });
  }
}

export const outboundTrafficGuard = new OutboundTrafficGuard();

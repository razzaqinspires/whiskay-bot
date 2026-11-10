import path from 'node:path';
import { mkdir, stat } from 'node:fs/promises';
import { readJsonFile, withFileLock, writeJsonAtomic } from '../../utils/PersistentJsonStore.js';

const DATA_ROOT = path.resolve(process.env.WHISKAY_DATA_DIR || 'data');
const DEFAULT_FILE = path.join(DATA_ROOT, 'message-repository', 'messages.json');
const VERSION = 1;
const MAX_ENTRIES = 5000;
const MAX_BYTES = 48 * 1024 * 1024;
const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function encodeValue(value, seen = new WeakSet(), depth = 0) {
  if (value == null || typeof value !== 'object') return value;
  if (depth > 40) throw new Error('Message payload exceeds serialization depth');
  if (Buffer.isBuffer(value)) return { __whiskayBinary: 'buffer', base64: value.toString('base64') };
  if (ArrayBuffer.isView(value)) {
    return { __whiskayBinary: value.constructor.name, base64: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64') };
  }
  if (value instanceof ArrayBuffer) return { __whiskayBinary: 'ArrayBuffer', base64: Buffer.from(value).toString('base64') };
  if (seen.has(value)) throw new Error('Circular message payload cannot be persisted');
  seen.add(value);
  let output;
  if (Array.isArray(value)) output = value.map(item => encodeValue(item, seen, depth + 1));
  else {
    output = {};
    for (const [key, item] of Object.entries(value)) output[key] = encodeValue(item, seen, depth + 1);
  }
  seen.delete(value);
  return output;
}

function decodeValue(value, depth = 0) {
  if (value == null || typeof value !== 'object') return value;
  if (depth > 40) throw new Error('Stored message exceeds deserialization depth');
  if (typeof value.__whiskayBinary === 'string' && typeof value.base64 === 'string') {
    const bytes = Buffer.from(value.base64, 'base64');
    switch (value.__whiskayBinary) {
      case 'buffer': return bytes;
      case 'Uint8Array': return new Uint8Array(bytes);
      case 'Uint16Array': return new Uint16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      case 'Uint32Array': return new Uint32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      case 'Int8Array': return new Int8Array(bytes);
      case 'ArrayBuffer': return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      default: return new Uint8Array(bytes);
    }
  }
  if (Array.isArray(value)) return value.map(item => decodeValue(item, depth + 1));
  const output = {};
  for (const [key, item] of Object.entries(value)) output[key] = decodeValue(item, depth + 1);
  return output;
}

function cleanJid(value, { participant = false } = {}) {
  if (typeof value !== 'string' || !value || value.length > 256 || /[\s\u0000-\u001f]/.test(value)) return null;
  const jid = value.split(':')[0] === value ? value : value;
  const userJid = /^\d+(?::\d+)?@(?:s\.whatsapp\.net|lid)$/i.test(jid);
  const groupJid = /^\d+(?:-\d+)?@g\.us$/i.test(jid);
  const channelJid = /^\d+@newsletter$/i.test(jid);
  const broadcastJid = /^(?:status|\d+)@broadcast$/i.test(jid);
  if (participant) return userJid ? jid : null;
  return userJid || groupJid || channelJid || broadcastJid ? jid : null;
}

function identityOf(key, { lookup = false } = {}) {
  const remoteJid = cleanJid(key?.remoteJid);
  const id = typeof key?.id === 'string' && key.id.length > 0 && key.id.length <= 256 && !/[\s\u0000-\u001f]/.test(key.id) ? key.id : null;
  if (!remoteJid || !id || typeof key?.fromMe !== 'boolean') return null;
  const participantProvided = key.participant != null && key.participant !== '';
  const participant = participantProvided ? cleanJid(key.participant, { participant: true }) : null;
  if (participantProvided && !participant) return null;
  if (participant && !remoteJid.endsWith('@g.us')) return null;
  return { remoteJid, id, fromMe: key.fromMe, participant, participantProvided };
}

function identityKey(identity) {
  return JSON.stringify([identity.remoteJid, identity.id, identity.fromMe, identity.participant || null]);
}

function validState(state) {
  if (!state || state.version !== VERSION || !Array.isArray(state.entries)) {
    const error = new Error('Message repository schema is invalid; refusing to overwrite it');
    error.code = 'WHISKAY_MESSAGE_REPOSITORY_CORRUPT';
    throw error;
  }
  for (const row of state.entries) {
    if (!row || typeof row.key !== 'object' || !identityOf(row.key) ||
        !Number.isFinite(Number(row.storedAt)) || !row.message || typeof row.message !== 'object') {
      const error = new Error('Message repository contains an invalid entry; refusing to overwrite it');
      error.code = 'WHISKAY_MESSAGE_REPOSITORY_CORRUPT';
      throw error;
    }
  }
  return state;
}

function emptyState() {
  return { version: VERSION, updatedAt: Date.now(), entries: [] };
}

/**
 * Bounded persistent Baileys message repository.
 * Uses a process-local cache and atomic JSON replacement under the project's
 * host-local file lock. This is not a distributed multi-host database.
 */
export class MessageRepository {
  constructor({
    file = DEFAULT_FILE,
    maxEntries = Number(process.env.WHISKAY_MESSAGE_REPOSITORY_MAX_ENTRIES) || MAX_ENTRIES,
    maxBytes = Number(process.env.WHISKAY_MESSAGE_REPOSITORY_MAX_BYTES) || MAX_BYTES,
    ttlMs = Number(process.env.WHISKAY_MESSAGE_REPOSITORY_TTL_MS) || DEFAULT_TTL_MS,
    now = () => Date.now(),
  } = {}) {
    this.file = path.resolve(file);
    this.lockFile = `${this.file}.lock`;
    this.maxEntries = Math.max(100, Math.min(20000, Number(maxEntries) || MAX_ENTRIES));
    this.maxBytes = Math.max(1024 * 1024, Math.min(256 * 1024 * 1024, Number(maxBytes) || MAX_BYTES));
    this.ttlMs = Math.max(60_000, Math.min(90 * 24 * 60 * 60 * 1000, Number(ttlMs) || DEFAULT_TTL_MS));
    this.now = now;
    this.entries = new Map();
    this.ready = false;
    this.writeQueue = Promise.resolve();
    this.persistTimer = null;
    this.dirty = false;
    this.counters = { stored: 0, restored: 0, misses: 0, rejected: 0, pruned: 0 };
  }

  async init() {
    if (this.ready) return this.stats();
    await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    await withFileLock(this.lockFile, async () => {
      const state = validState(await readJsonFile(this.file, emptyState()));
      const cutoff = this.now() - this.ttlMs;
      for (const row of state.entries) {
        if (Number(row.storedAt) < cutoff) { this.counters.pruned++; continue; }
        const identity = identityOf(row.key);
        const key = identityKey(identity);
        this.entries.set(key, row);
      }
      this.#trim();
      this.counters.restored = this.entries.size;
    });
    this.ready = true;
    return this.stats();
  }

  remember(message) {
    if (!this.ready) {
      this.counters.rejected++;
      return false;
    }
    const identity = identityOf(message?.key);
    if (!identity || !message?.message || typeof message.message !== 'object') {
      this.counters.rejected++;
      return false;
    }
    let encoded;
    try { encoded = encodeValue(message); }
    catch { this.counters.rejected++; return false; }
    const row = { key: { remoteJid: identity.remoteJid, id: identity.id, fromMe: identity.fromMe, ...(identity.participant ? { participant: identity.participant } : {}) }, storedAt: this.now(), message: encoded };
    const id = identityKey(identity);
    this.entries.delete(id);
    this.entries.set(id, row);
    this.#trim();
    this.counters.stored++;
    this.#schedulePersist();
    return true;
  }

  async get(key) {
    if (!this.ready) await this.init();
    await this.writeQueue;
    const identity = identityOf(key, { lookup: true });
    if (!identity) { this.counters.misses++; return undefined; }
    let row;
    if (identity.participantProvided) {
      row = this.entries.get(identityKey(identity));
    } else {
      // A missing participant is accepted only when the remaining identity tuple
      // resolves to exactly one stored message. Never choose the first collision.
      const matches = [...this.entries.values()].filter(candidate =>
        candidate.key.remoteJid === identity.remoteJid &&
        candidate.key.id === identity.id &&
        candidate.key.fromMe === identity.fromMe
      );
      if (matches.length === 1) row = matches[0];
    }
    if (!row || this.now() - Number(row.storedAt) > this.ttlMs) {
      this.counters.misses++;
      return undefined;
    }
    // Return the original WAMessage content, not a placeholder or an ID-only match.
    try { return decodeValue(row.message); }
    catch { this.counters.misses++; return undefined; }
  }

  async flush() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.dirty) this.#persistNow();
    await this.writeQueue;
    if (this.lastError) throw this.lastError;
    return this.stats();
  }

  async close() {
    await this.flush();
    this.ready = false;
  }

  stats() {
    let bytes = 0;
    try { bytes = Buffer.byteLength(JSON.stringify({ version: VERSION, entries: [...this.entries.values()] })); } catch {}
    return {
      ready: this.ready, entries: this.entries.size, bytes,
      maxEntries: this.maxEntries, maxBytes: this.maxBytes, ttlMs: this.ttlMs,
      file: this.file, ...this.counters,
    };
  }

  #trim() {
    const cutoff = this.now() - this.ttlMs;
    for (const [key, row] of this.entries) {
      if (Number(row.storedAt) < cutoff) {
        this.entries.delete(key);
        this.counters.pruned++;
      }
    }
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value);
      this.counters.pruned++;
    }
    // Byte cap is checked against encoded entries; evict oldest until within budget.
    let size = 0;
    try { size = Buffer.byteLength(JSON.stringify([...this.entries.values()])); } catch { size = this.maxBytes + 1; }
    while (size > this.maxBytes && this.entries.size) {
      this.entries.delete(this.entries.keys().next().value);
      this.counters.pruned++;
      try { size = Buffer.byteLength(JSON.stringify([...this.entries.values()])); } catch { size = this.maxBytes + 1; }
    }
  }

  #schedulePersist() {
    this.dirty = true;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.#persistNow();
    }, 250);
    this.persistTimer.unref?.();
  }

  #persistNow() {
    if (!this.dirty) return;
    this.dirty = false;
    this.writeQueue = this.writeQueue.catch(() => {}).then(() => withFileLock(this.lockFile, async () => {
      // Re-read before replacing so another local process' committed entries are not lost.
      const existing = validState(await readJsonFile(this.file, emptyState()));
      const merged = new Map();
      const cutoff = this.now() - this.ttlMs;
      for (const row of existing.entries) {
        if (Number(row.storedAt) >= cutoff) merged.set(identityKey(identityOf(row.key)), row);
      }
      for (const [key, row] of this.entries) {
        const prior = merged.get(key);
        if (!prior || Number(row.storedAt) >= Number(prior.storedAt)) merged.set(key, row);
      }
      const ordered = [...merged.values()].sort((a, b) => Number(a.storedAt) - Number(b.storedAt));
      const bounded = ordered.slice(-this.maxEntries);
      let state = { version: VERSION, updatedAt: this.now(), entries: bounded };
      let encodedSize = Buffer.byteLength(JSON.stringify(state));
      while (encodedSize > this.maxBytes && state.entries.length) {
        state.entries.shift();
        encodedSize = Buffer.byteLength(JSON.stringify(state));
      }
      if (state.entries.length < merged.size) this.counters.pruned += merged.size - state.entries.length;
      await writeJsonAtomic(this.file, state, { backup: true });
      // Keep the live in-memory map untouched: a new remember() may have arrived
      // while this disk transaction was awaiting its lock and fsync.
      this.lastError = null;
    })).catch(error => {
      // Preserve the failed queue promise as a rejected flush signal; never silently
      // replace a corrupt database with an empty one.
      this.dirty = true;
      this.lastError = error;
      throw error;
    });
    // Attach a handler to avoid an unhandled rejection; flush() still observes it.
    this.writeQueue.catch(() => {});
  }
}

export const messageRepository = new MessageRepository();
export default messageRepository;

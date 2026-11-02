import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_FILE = path.join(ROOT, 'data', 'group-metadata.json');
const cleanText = (value, max = 2000) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);

function participantId(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  return String(value.id || value.jid || value.lid || value.phoneNumber || '').trim();
}

function normalizeParticipant(value) {
  const id = participantId(value);
  if (!id || !id.includes('@')) return null;
  if (typeof value === 'string') return { id };
  return {
    id,
    ...(value.phoneNumber ? { phoneNumber: String(value.phoneNumber) } : {}),
    ...(value.lid ? { lid: String(value.lid) } : {}),
    ...(value.name || value.notify || value.pushName ? { name: cleanText(value.name || value.notify || value.pushName, 100) } : {}),
    ...(value.admin ? { admin: String(value.admin).slice(0, 20) } : {}),
    ...(value.isAdmin ? { admin: 'admin' } : {}),
    ...(value.isSuperAdmin ? { admin: 'superadmin' } : {})
  };
}

function aliases(value) {
  const row = normalizeParticipant(value);
  if (!row) return [];
  return [...new Set([row.id, row.phoneNumber, row.lid].filter(Boolean).map(String))];
}

function normalizeMetadata(input, jidHint = '') {
  if (!input || typeof input !== 'object') return null;
  const id = String(input.id || jidHint || '').trim();
  if (!id.endsWith('@g.us')) return null;
  const out = { id };
  const fields = ['subject', 'owner', 'ownerJid', 'desc', 'descId', 'creation', 'announce', 'restrict', 'size', 'addressingMode', 'subjectOwner', 'subjectTime'];
  for (const key of fields) {
    if (Object.hasOwn(input, key) && input[key] !== undefined && input[key] !== null) {
      const value = input[key];
      out[key] = typeof value === 'string' ? cleanText(value, key === 'desc' ? 4096 : 300) : value;
    }
  }
  if (Array.isArray(input.participants)) out.participants = input.participants.map(normalizeParticipant).filter(Boolean);
  if (out.size == null && out.participants) out.size = out.participants.length;
  return out;
}

export class GroupMetadataStore {
  constructor({ file = DEFAULT_FILE, persistDelayMs = 180 } = {}) {
    this.file = file;
    this.persistDelayMs = Math.max(0, Number(persistDelayMs) || 0);
    this.groups = new Map();
    this.loaded = false;
    this.snapshotComplete = false;
    this.dirty = false;
    this.timer = null;
    this.writeChain = Promise.resolve();
  }

  async load() {
    if (this.loaded) return this;
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      this.snapshotComplete = Boolean(parsed?.snapshotComplete);
      const source = parsed?.groups && typeof parsed.groups === 'object' ? parsed.groups : parsed;
      for (const [jid, raw] of Object.entries(source || {})) {
        const metadata = normalizeMetadata(raw, jid);
        if (metadata) this.groups.set(jid, metadata);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw new Error(`Gagal membaca cache metadata grup: ${error.message}`);
    }
    this.loaded = true;
    return this;
  }

  get(jid) { return this.groups.get(String(jid || '')) || null; }
  all() { return [...this.groups.values()].sort((a, b) => String(a.subject || a.id).localeCompare(String(b.subject || b.id))); }
  count() { return this.groups.size; }
  hasInitialSnapshot() { return this.snapshotComplete; }
  markInitialSnapshot() { this.snapshotComplete = true; this.schedulePersist(); }

  upsert(input, jidHint = '') {
    const next = normalizeMetadata(input, jidHint);
    if (!next) return null;
    const previous = this.groups.get(next.id) || { id: next.id, participants: [] };
    const merged = { ...previous, ...next };
    if (!Object.hasOwn(next, 'participants')) merged.participants = previous.participants || [];
    merged.size = Array.isArray(merged.participants) ? merged.participants.length : Number(merged.size || 0);
    this.groups.set(next.id, merged);
    this.schedulePersist();
    return merged;
  }

  applyGroupUpdates(updates) {
    const rows = Array.isArray(updates) ? updates : [updates];
    for (const row of rows) if (row?.id) this.upsert(row, row.id);
  }

  applyParticipantUpdate(update, ownJids = []) {
    const id = String(update?.id || '').trim();
    if (!id.endsWith('@g.us')) return null;
    const incoming = (Array.isArray(update.participants) ? update.participants : []).map(normalizeParticipant).filter(Boolean);
    const own = new Set(ownJids.map(String).filter(Boolean));
    const ownAliases = new Set(own);
    const botWasRemoved = ['remove', 'leave'].includes(String(update.action || '').toLowerCase()) && incoming.some(row => aliases(row).some(alias => ownAliases.has(alias)));
    if (botWasRemoved) { this.remove(id); return null; }

    const current = this.groups.get(id) || { id, subject: '(metadata belum tersinkron)', participants: [] };
    const members = Array.isArray(current.participants) ? [...current.participants] : [];
    const action = String(update.action || '').toLowerCase();
    for (const participant of incoming) {
      const keys = new Set(aliases(participant));
      const index = members.findIndex(member => aliases(member).some(alias => keys.has(alias)));
      if (action === 'remove' || action === 'leave') {
        if (index >= 0) members.splice(index, 1);
      } else if (action === 'promote' || action === 'demote') {
        const next = { ...(index >= 0 ? members[index] : {}), ...participant, admin: action === 'promote' ? 'admin' : null };
        if (index >= 0) members[index] = next; else members.push(next);
      } else if (action === 'modify') {
        if (index >= 0) members[index] = { ...members[index], ...participant };
        else members.push(participant);
      } else if (index >= 0) members[index] = { ...members[index], ...participant };
      else members.push(participant);
    }
    const next = { ...current, participants: members, size: members.length, updatedAt: new Date().toISOString() };
    this.groups.set(id, next);
    this.schedulePersist();
    return next;
  }

  remove(jid) {
    const removed = this.groups.delete(String(jid || ''));
    if (removed) this.schedulePersist();
    return removed;
  }

  schedulePersist() {
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.flush().catch(error => console.warn('[group-meta] persist failed:', error.message)); }, this.persistDelayMs);
    this.timer.unref?.();
  }

  async flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.dirty) return;
    this.dirty = false;
    const snapshot = { version: 1, snapshotComplete: this.snapshotComplete, updatedAt: new Date().toISOString(), groups: Object.fromEntries(this.groups) };
    const run = this.writeChain.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      const tmp = `${this.file}.tmp-${process.pid}`;
      await writeFile(tmp, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
      await rename(tmp, this.file);
    });
    this.writeChain = run.catch(() => {});
    await run;
    if (this.dirty) await this.flush();
  }
}

export const groupMetadataStore = new GroupMetadataStore();
export async function loadGroupMetadataStore() { return groupMetadataStore.load(); }
export function getCachedGroupMetadata(jid) { return groupMetadataStore.get(jid); }

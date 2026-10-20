import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import Logger from './Logger.js';
import { diffLines, diffPreview } from '../utils/diff.js';

const MAX_PREVIEW = 600;
const MAX_DIFF_LINES = 80;

/**
 * Enhanced ring-buffer event log for watcher & reload events.
 *
 * Features:
 *  - Content capture per change (add/change)
 *  - Line-level diff vs previous version
 *  - Full-text search (file, content, diff, error)
 *  - Filters: kind, file, keyword, since, until
 *  - IDs for detail lookup
 *  - JSONL persistence
 */
export class WatcherLog {
  constructor({ file = null, watchDir = null, maxEntries = 1000, maxBytes = 4 * 1024 * 1024 } = {}) {
    this.file = file;
    this.watchDir = watchDir;
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;

    this._ring = [];
    this._nextId = 1;
    this._fileState = new Map();   // rel-path → { content, hash, ts }

    if (this.file) {
      try {
        const dir = path.dirname(this.file);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        if (existsSync(this.file)) this._loadFromFile();
      } catch (e) {
        Logger.warn(`WatcherLog init: ${e.message}`);
      }
    }
  }

  _loadFromFile() {
    try {
      const raw = readFileSync(this.file, 'utf8');
      const lines = raw.split('\n').filter(Boolean);
      const tail = lines.slice(-this.maxEntries);
      let maxId = 0;
      for (const line of tail) {
        try {
          const e = JSON.parse(line);
          this._ring.push(e);
          if (typeof e.id === 'number' && e.id > maxId) maxId = e.id;
        } catch {}
      }
      this._nextId = maxId + 1;
    } catch (e) {
      Logger.warn(`WatcherLog load: ${e.message}`);
    }
  }

  _rotateIfNeeded() {
    if (!this.file) return;
    try {
      const st = statSync(this.file);
      if (st.size > this.maxBytes) {
        const raw = readFileSync(this.file, 'utf8');
        const lines = raw.split('\n').filter(Boolean).slice(-Math.floor(this.maxEntries / 2));
        writeFileSync(this.file, lines.join('\n') + '\n');
      }
    } catch {}
  }

  /** Capture content + diff for file-mutating events. */
  _captureContent(e) {
    if (!this.watchDir) return;
    if (!['add', 'change', 'unlink'].includes(e.kind)) return;
    if (!e.file) return;

    const abs = path.join(this.watchDir, e.file);

    try {
      if (e.kind === 'unlink') {
        const prev = this._fileState.get(e.file);
        if (prev) {
          e.hash = null;
          e.prevHash = prev.hash;
          e.size = 0;
          e.lines = 0;
          e.diff = { added: [], removed: [], addedCount: 0, removedCount: prev.content.split('\n').length };
        }
        this._fileState.delete(e.file);
        return;
      }

      const content = readFileSync(abs, 'utf8');
      const hash = createHash('sha1').update(content).digest('hex').slice(0, 12);
      const lines = content.split('\n');
      const prev = this._fileState.get(e.file);

      const diff = prev
        ? diffLines(prev.content, content)
        : {
            added: lines.map((text, i) => ({ line: i + 1, text })),
            removed: [],
            addedCount: lines.length,
            removedCount: 0
          };

      e.hash = hash;
      e.prevHash = prev?.hash || null;
      e.size = content.length;
      e.lines = lines.length;

      e.diff = {
        added: diff.added.slice(0, MAX_DIFF_LINES),
        removed: diff.removed.slice(0, MAX_DIFF_LINES),
        addedCount: diff.addedCount,
        removedCount: diff.removedCount,
        truncated: diff.added.length > MAX_DIFF_LINES || diff.removed.length > MAX_DIFF_LINES
      };

      e.preview = content.slice(0, MAX_PREVIEW);
      e.previewLines = lines.slice(0, 15);

      this._fileState.set(e.file, { content, hash, ts: e.t });
    } catch (err) {
      e.captureError = err.message;
    }
  }

  push(event) {
    const e = {
      id: this._nextId++,
      t: new Date().toISOString(),
      ...event
    };

    this._captureContent(e);

    this._ring.push(e);
    if (this._ring.length > this.maxEntries) this._ring.shift();

    if (this.file) {
      try {
        appendFileSync(this.file, JSON.stringify(e) + '\n');
        if (this._ring.length % 50 === 0) this._rotateIfNeeded();
      } catch (err) {
        Logger.warn(`WatcherLog append: ${err.message}`);
      }
    }
    return e;
  }

  getById(id) {
    const n = Number(id);
    if (!Number.isFinite(n)) return null;
    for (let i = this._ring.length - 1; i >= 0; i--) {
      if (this._ring[i].id === n) return this._ring[i];
    }
    return null;
  }

  /**
   * Unified query.
   * @param {object} opts
   * @param {number} [opts.limit=20]
   * @param {string|string[]} [opts.kind]
   * @param {string} [opts.file]      - substring match on file path
   * @param {string} [opts.q]         - full-text search
   * @param {string|number} [opts.since] - ISO or unix ms
   * @param {string|number} [opts.until]
   */
  query({ limit = 20, kind = null, file = null, q = null, since = null, until = null } = {}) {
    const kinds = kind ? (Array.isArray(kind) ? kind.map(k => k.toLowerCase()) : [String(kind).toLowerCase()]) : null;
    const sinceMs = parseTime(since);
    const untilMs = parseTime(until);
    const query = q ? String(q).toLowerCase() : null;
    const fileFilter = file ? String(file).toLowerCase() : null;

    const out = [];
    for (let i = this._ring.length - 1; i >= 0; i--) {
      const e = this._ring[i];
      if (kinds && !kinds.includes(String(e.kind).toLowerCase())) continue;
      if (fileFilter && !(e.file || '').toLowerCase().includes(fileFilter)) continue;
      if (sinceMs && new Date(e.t).getTime() < sinceMs) continue;
      if (untilMs && new Date(e.t).getTime() > untilMs) continue;
      if (query && !this._matches(e, query)) continue;
      out.push(e);
      if (out.length >= limit) break;
    }
    return out;
  }

  _matches(e, q) {
    const hit = s => typeof s === 'string' && s.toLowerCase().includes(q);

    if (hit(e.file)) return true;
    if (hit(e.preview)) return true;
    if (hit(e.error)) return true;
    if (hit(e.captureError)) return true;
    if (hit(e.reason)) return true;

    if (e.diff) {
      for (const a of (e.diff.added || [])) if (hit(a.text)) return true;
      for (const r of (e.diff.removed || [])) if (hit(r.text)) return true;
    }
    if (Array.isArray(e.files)) {
      for (const f of e.files) if (hit(f)) return true;
    }
    return false;
  }

  /** Search helper that also returns WHERE the hit occurred. */
  searchDetailed(query, { limit = 20, ...opts } = {}) {
    const q = String(query || '').toLowerCase();
    if (!q) return [];
    const entries = this.query({ limit: 100000, ...opts });
    const results = [];
    for (const e of entries) {
      const hits = [];
      if ((e.file || '').toLowerCase().includes(q)) hits.push({ where: 'file', text: e.file });
      if ((e.preview || '').toLowerCase().includes(q)) hits.push({ where: 'content', text: sliceAround(e.preview, q) });
      if (e.diff) {
        for (const a of (e.diff.added || [])) if (a.text.toLowerCase().includes(q)) hits.push({ where: 'added', line: a.line, text: a.text });
        for (const r of (e.diff.removed || [])) if (r.text.toLowerCase().includes(q)) hits.push({ where: 'removed', line: r.line, text: r.text });
      }
      if ((e.error || '').toLowerCase().includes(q)) hits.push({ where: 'error', text: e.error });
      if (hits.length) results.push({ entry: e, hits });
      if (results.length >= limit) break;
    }
    return results;
  }

  entries(opts) { return this.query(opts); }

  count(kindFilter) {
    if (!kindFilter) return this._ring.length;
    const ks = Array.isArray(kindFilter) ? kindFilter : [kindFilter];
    return this._ring.filter(e => ks.includes(e.kind)).length;
  }

  summary() {
    const s = { total: this._ring.length, files: this._fileState.size };
    for (const e of this._ring) s[e.kind] = (s[e.kind] || 0) + 1;
    return s;
  }

  clear() {
    this._ring = [];
    this._fileState.clear();
    this._nextId = 1;
    if (this.file) {
      try { writeFileSync(this.file, ''); } catch {}
    }
  }

  exportJSONL({ limit = null } = {}) {
    const arr = limit ? this._ring.slice(-limit) : this._ring.slice();
    return arr.map(e => JSON.stringify(e)).join('\n');
  }
}

function parseTime(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  // Relative: 5m, 2h, 1d
  const m = s.match(/^(\d+)\s*(s|m|h|d)$/i);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
    return Date.now() - n * mult;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

function sliceAround(text, q, ctx = 40) {
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return text.slice(0, 120);
  const start = Math.max(0, i - ctx);
  const end = Math.min(text.length, i + q.length + ctx);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat, open } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { finished } from 'node:stream/promises';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

/** Bounded fixed-window limiter with lazy expiry and a hard memory ceiling. */
export class FixedWindowRateLimiter {
  constructor({ windowMs = 60_000, maxEntries = 10_000 } = {}) {
    this.windowMs = Math.max(1_000, Number(windowMs) || 60_000);
    this.maxEntries = Math.max(100, Number(maxEntries) || 10_000);
    this.entries = new Map();
  }

  consume(key, limit, now = Date.now()) {
    const normalizedKey = String(key || 'unknown').slice(0, 180);
    const max = Math.max(1, Math.min(10_000, Math.floor(Number(limit) || 1)));
    let entry = this.entries.get(normalizedKey);
    if (!entry || now - entry.startedAt >= this.windowMs || now < entry.startedAt) {
      entry = { startedAt: now, count: 0 };
    }
    entry.count++;
    this.entries.delete(normalizedKey);
    this.entries.set(normalizedKey, entry);

    if (this.entries.size > this.maxEntries) this.#sweep(now, true);
    const remainingMs = Math.max(0, this.windowMs - (now - entry.startedAt));
    return {
      allowed: entry.count <= max,
      count: entry.count,
      remaining: Math.max(0, max - entry.count),
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
    };
  }

  #sweep(now, force = false) {
    for (const [key, entry] of this.entries) {
      if (now - entry.startedAt >= this.windowMs || now < entry.startedAt) this.entries.delete(key);
      if (this.entries.size <= this.maxEntries && !force) break;
    }
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
  }

  get size() { return this.entries.size; }
  clear() { this.entries.clear(); }
}

export function parseContentLength(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!/^(0|[1-9]\d*)$/.test(String(value).trim())) return NaN;
  const size = Number(value);
  return Number.isSafeInteger(size) ? size : NaN;
}

/** Stream an HTTP request body to a private temporary file with a strict byte ceiling. */
export async function streamRequestToFile(req, destination, { maxBytes, declaredLength = parseContentLength(req.headers?.['content-length']) } = {}) {
  const ceiling = Math.max(1, Math.floor(Number(maxBytes) || 1));
  if (Number.isNaN(declaredLength)) throw Object.assign(new Error('invalid_content_length'), { code: 'WHISKAY_INVALID_CONTENT_LENGTH' });
  if (declaredLength !== null && declaredLength > ceiling) throw Object.assign(new Error('payload_too_large'), { code: 'WHISKAY_PAYLOAD_TOO_LARGE' });

  const target = path.resolve(destination);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const output = createWriteStream(target, { flags: 'wx', mode: 0o600 });
  let totalBytes = 0;
  let tooLarge = false;
  let requestEnded = false;

  try {
    await once(output, 'open');
    for await (const chunk of req) {
      totalBytes += chunk.length;
      if (totalBytes > ceiling) {
        tooLarge = true;
        continue; // Drain the request so an HTTP error response can still be written.
      }
      if (!output.write(chunk)) await once(output, 'drain');
    }
    requestEnded = true;
    output.end();
    await finished(output);
    if (tooLarge) throw Object.assign(new Error('payload_too_large'), { code: 'WHISKAY_PAYLOAD_TOO_LARGE' });
    if (declaredLength !== null && totalBytes !== declaredLength) {
      throw Object.assign(new Error('content_length_mismatch'), { code: 'WHISKAY_CONTENT_LENGTH_MISMATCH' });
    }
    if (totalBytes === 0) throw Object.assign(new Error('empty_file'), { code: 'WHISKAY_EMPTY_PAYLOAD' });
    const info = await stat(target);
    if (!info.isFile() || info.size !== totalBytes) throw new Error('temporary_upload_verification_failed');
    return { file: target, bytes: totalBytes };
  } catch (error) {
    if (!requestEnded && !req.destroyed) req.resume?.();
    output.destroy();
    await rm(target, { force: true }).catch(() => {});
    throw error;
  }
}

/** Small bounded in-memory reader for compact JSON webhook payloads. */
export async function readRequestBuffer(req, { maxBytes = 8192, declaredLength = parseContentLength(req.headers?.['content-length']) } = {}) {
  const ceiling = Math.max(1, Math.floor(Number(maxBytes) || 1));
  if (Number.isNaN(declaredLength)) throw Object.assign(new Error('invalid_content_length'), { code: 'WHISKAY_INVALID_CONTENT_LENGTH' });
  if (declaredLength !== null && declaredLength > ceiling) throw Object.assign(new Error('payload_too_large'), { code: 'WHISKAY_PAYLOAD_TOO_LARGE' });
  const chunks = [];
  let totalBytes = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > ceiling) { tooLarge = true; continue; }
    chunks.push(Buffer.from(chunk));
  }
  if (tooLarge) throw Object.assign(new Error('payload_too_large'), { code: 'WHISKAY_PAYLOAD_TOO_LARGE' });
  if (declaredLength !== null && totalBytes !== declaredLength) {
    throw Object.assign(new Error('content_length_mismatch'), { code: 'WHISKAY_CONTENT_LENGTH_MISMATCH' });
  }
  return { buffer: Buffer.concat(chunks, totalBytes), bytes: totalBytes };
}


const SIGNATURES = {
  pdf: Buffer.from('%PDF-'),
  ole: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  zip: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
};

/** Inspect only a small prefix; never buffer an uploaded document into memory. */
export async function validateDocumentFile(file, extension) {
  const ext = String(extension || '').toLowerCase();
  const handle = await open(file, 'r');
  const prefix = Buffer.alloc(4096);
  let bytesRead = 0;
  try {
    ({ bytesRead } = await handle.read(prefix, 0, prefix.length, 0));
  } finally {
    await handle.close();
  }
  const sample = prefix.subarray(0, bytesRead);
  const startsWith = signature => sample.length >= signature.length && sample.subarray(0, signature.length).equals(signature);
  if (ext === '.pdf') return { valid: startsWith(SIGNATURES.pdf), kind: 'pdf' };
  if (['.doc', '.xls', '.ppt'].includes(ext)) return { valid: startsWith(SIGNATURES.ole), kind: 'ole-office' };
  if (['.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp'].includes(ext)) {
    return { valid: startsWith(SIGNATURES.zip), kind: 'openxml-zip' };
  }
  if (['.txt', '.csv'].includes(ext)) {
    if (sample.includes(0)) return { valid: false, kind: 'binary-text-mismatch' };
    try { new TextDecoder('utf-8', { fatal: true }).decode(sample, { stream: true }); return { valid: true, kind: 'text' }; }
    catch { return { valid: false, kind: 'invalid-utf8' }; }
  }
  return { valid: false, kind: 'unsupported' };
}

export function createWebhookTempPath(root, extension = '.upload') {
  const ext = /^\.[a-z0-9]{1,10}$/i.test(extension) ? extension.toLowerCase() : '.upload';
  return path.join(path.resolve(root), `${Date.now()}-${randomUUID()}${ext}.tmp`);
}

export function getTrustedClientAddress(req, { trustCloudflare = false } = {}) {
  const remote = String(req?.socket?.remoteAddress || 'unknown').slice(0, 80);
  if (!trustCloudflare) return remote;
  const forwarded = String(req?.headers?.['cf-connecting-ip'] || '').trim();
  return forwarded && forwarded.length <= 80 && !/[\s,]/.test(forwarded) ? forwarded : remote;
}

export function sanitizeDocumentFilename(value) {
  const leaf = String(value || '').replace(/\\/g, '/').split('/').pop() || '';
  const basename = leaf.replace(/[\0\r\n]/g, '_').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180);
  if (!basename || basename === '.' || basename === '..' || basename.includes('..')) return '';
  return basename;
}

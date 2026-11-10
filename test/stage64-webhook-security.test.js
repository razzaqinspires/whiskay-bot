import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  FixedWindowRateLimiter,
  createWebhookTempPath,
  getTrustedClientAddress,
  parseContentLength,
  sanitizeDocumentFilename,
  streamRequestToFile,
  validateDocumentFile,
} from '../src/services/WebhookSecurity.js';

function requestFrom(chunks, contentLength) {
  const request = Readable.from(chunks);
  request.headers = contentLength === undefined ? {} : { 'content-length': String(contentLength) };
  request.socket = { remoteAddress: '127.0.0.1' };
  return request;
}

test('fixed-window limiter is deterministic and bounded', () => {
  const limiter = new FixedWindowRateLimiter({ windowMs: 1000, maxEntries: 100 });
  assert.equal(limiter.consume('ip-a', 2, 1000).allowed, true);
  assert.equal(limiter.consume('ip-a', 2, 1001).allowed, true);
  const blocked = limiter.consume('ip-a', 2, 1002);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
  assert.equal(limiter.consume('ip-a', 2, 2001).allowed, true);
  for (let index = 0; index < 150; index++) limiter.consume(`ip-${index}`, 1, 3000);
  assert.ok(limiter.size <= 100);
});

test('content length parser rejects malformed or unsafe lengths', () => {
  assert.equal(parseContentLength(undefined), null);
  assert.equal(parseContentLength('0'), 0);
  assert.equal(parseContentLength('123'), 123);
  assert.ok(Number.isNaN(parseContentLength('-1')));
  assert.ok(Number.isNaN(parseContentLength('1.5')));
  assert.ok(Number.isNaN(parseContentLength('9007199254740992')));
});

test('TEAMDROP request body streams to a private file without buffering the full payload', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-teamdrop-'));
  const file = createWebhookTempPath(root, '.pdf');
  const body = Buffer.from('%PDF-test-stream');
  try {
    const result = await streamRequestToFile(requestFrom([body.subarray(0, 5), body.subarray(5)], body.length), file, { maxBytes: 1024 });
    assert.equal(result.bytes, body.length);
    assert.deepEqual(await readFile(file), body);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('oversized streamed request is drained, rejected, and its temporary file removed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-teamdrop-large-'));
  const file = createWebhookTempPath(root, '.bin');
  try {
    await assert.rejects(
      streamRequestToFile(requestFrom([Buffer.alloc(4), Buffer.alloc(4)], 8), file, { maxBytes: 5 }),
      error => error.code === 'WHISKAY_PAYLOAD_TOO_LARGE',
    );
    await assert.rejects(stat(file), error => error.code === 'ENOENT');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('streamed request validates declared length and empty body', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-teamdrop-invalid-'));
  try {
    await assert.rejects(
      streamRequestToFile(requestFrom([Buffer.from('abc')], 4), path.join(root, 'mismatch.tmp'), { maxBytes: 20 }),
      error => error.code === 'WHISKAY_CONTENT_LENGTH_MISMATCH',
    );
    await assert.rejects(
      streamRequestToFile(requestFrom([], 0), path.join(root, 'empty.tmp'), { maxBytes: 20 }),
      error => error.code === 'WHISKAY_EMPTY_PAYLOAD',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('filename sanitization prevents path traversal and control characters', () => {
  assert.equal(sanitizeDocumentFilename('../../secret\r\n.pdf'), 'secret__.pdf');
  assert.equal(sanitizeDocumentFilename('..'), '');
  assert.equal(sanitizeDocumentFilename('report.pdf'), 'report.pdf');
});

test('Cloudflare client header is only trusted when explicitly configured', () => {
  const req = { socket: { remoteAddress: '10.0.0.2' }, headers: { 'cf-connecting-ip': '203.0.113.10' } };
  assert.equal(getTrustedClientAddress(req), '10.0.0.2');
  assert.equal(getTrustedClientAddress(req, { trustCloudflare: true }), '203.0.113.10');
  req.headers['cf-connecting-ip'] = '203.0.113.10, 10.0.0.1';
  assert.equal(getTrustedClientAddress(req, { trustCloudflare: true }), '10.0.0.2');
});

test('TEAMDROP validates a small file signature without loading the full document', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-teamdrop-signature-'));
  try {
    const pdf = path.join(root, 'valid.pdf');
    const fake = path.join(root, 'fake.pdf');
    await import('node:fs/promises').then(({ writeFile }) => Promise.all([
      writeFile(pdf, Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(1024 * 32)])),
      writeFile(fake, Buffer.from('not a pdf')),
    ]));
    assert.deepEqual(await validateDocumentFile(pdf, '.pdf'), { valid: true, kind: 'pdf' });
    assert.deepEqual(await validateDocumentFile(fake, '.pdf'), { valid: false, kind: 'pdf' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

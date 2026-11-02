import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTestCommandsPlugin } from '../src/plugins/owner/testcommands.js';

function makeContext({ owner = true, args = [], command = 'testcommands' } = {}) {
  const replies = [];
  const interactive = [];
  return {
    ctx: {
      isOwner: owner,
      args,
      command,
      prefix: '.',
      reply: async text => { replies.push(String(text)); return true; },
      sendInteractive: async payload => { interactive.push(payload); return true; },
    },
    replies,
    interactive,
  };
}

function successfulReport() {
  return {
    id: 'QA-TEST-001', status: 'SUCCESS', durationMs: 1200,
    node: 'v20.20.2', platform: 'linux', projectVersion: '2.35.4',
    steps: [
      { name: 'npm-ci', ok: true, exitCode: 0, durationMs: 100 },
      { name: 'node-check', ok: true, exitCode: 0, durationMs: 100 },
      { name: 'verify-all', ok: true, exitCode: 0, durationMs: 500, summary: { tests: 3, passed: 3, failed: 0 } },
      { name: 'npm-test', ok: true, exitCode: 0, durationMs: 500, summary: { tests: 3, passed: 3, failed: 0 } },
    ],
    syntax: { checked: 8, failed: 0 },
    successReportPath: 'test/reports/WHISKAY-VERIFY-SUCCESS.md',
  };
}

test('testcommands plugin registers every spelling used in chat and remains owner-only', () => {
  const plugin = createTestCommandsPlugin();
  assert.deepEqual(plugin.command, ['testcommands', 'testcommand', 'testcmd', 'testcmds']);
  assert.equal(plugin.owner, true);
  assert.equal(plugin.energyMode, 'free');
  assert.equal(plugin.cooldown, 2500);
});

test('bare testcommand displays help and never starts the expensive QA pipeline', async () => {
  let runs = 0;
  const plugin = createTestCommandsPlugin({ runVerification: async () => { runs++; throw new Error('should not run'); } });
  const { ctx, interactive } = makeContext({ args: [] });
  await plugin.execute(ctx);
  assert.equal(runs, 0);
  assert.equal(interactive.length, 1);
  assert.match(interactive[0].body, /testcommands run/);
  assert.match(interactive[0].body, /URUTAN PIPELINE/);
  assert.match(interactive[0].body, /OUTPUT/);
  assert.equal(interactive[0].buttons.length, 3);
  assert.deepEqual(interactive[0].buttons.map(button => button.id), [
    '.testcommands run', '.testcommands status', '.testcommands report',
  ]);
});

test('non-owner receives a clear denial without invoking any pipeline', async () => {
  let runs = 0;
  const plugin = createTestCommandsPlugin({ runVerification: async () => { runs++; } });
  const { ctx, interactive } = makeContext({ owner: false, args: ['run'] });
  await plugin.execute(ctx);
  assert.equal(runs, 0);
  assert.match(interactive[0].title, /AKSES DIBATASI/i);
  assert.equal(interactive[0].buttons[0].id, '.menu');
});

test('run acknowledges immediately, rejects duplicate runs, and sends the final interactive result', async () => {
  let resolveRun;
  let runCount = 0;
  const deferred = new Promise(resolve => { resolveRun = resolve; });
  const plugin = createTestCommandsPlugin({
    runVerification: async options => {
      runCount++;
      options.onProgress?.({ type: 'step-start', step: 'npm-ci', message: 'npm ci start' });
      return deferred;
    },
  });
  const first = makeContext({ args: ['run'] });
  await plugin.execute(first.ctx);
  assert.equal(runCount, 1);
  assert.match(first.interactive[0].title, /FULL VERIFICATION DIMULAI/);
  assert.match(first.interactive[0].body, /background/);

  const duplicate = makeContext({ args: ['run'] });
  await plugin.execute(duplicate.ctx);
  assert.equal(runCount, 1);
  assert.match(duplicate.interactive[0].title, /QA SEDANG BERJALAN/i);
  assert.equal(duplicate.interactive[0].buttons.length, 2);

  resolveRun(successfulReport());
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(first.interactive.length, 3);
  assert.match(first.interactive[1].title, /Instalasi dependency/);
  assert.match(first.interactive[0].title, /VERIFICATION DIMULAI/);
  assert.equal(first.interactive[0].buttons.length, 2);
  assert.match(first.interactive[2].title, /FULL TEST LULUS/);
  assert.equal(first.interactive[2].buttons.length, 2);
});

test('status is available while verification runs and reports the active run', async () => {
  let resolveRun;
  const deferred = new Promise(resolve => { resolveRun = resolve; });
  const plugin = createTestCommandsPlugin({ runVerification: async () => deferred });
  const run = makeContext({ args: ['run'] });
  await plugin.execute(run.ctx);
  const status = makeContext({ args: ['status'] });
  await plugin.execute(status.ctx);
  assert.equal(status.interactive.length, 1);
  assert.match(status.interactive[0].body, /Tahap aktif/);
  assert.doesNotMatch(status.interactive[0].body, /📊 WHISKAY QA STATUS/);
  assert.doesNotMatch(status.interactive[0].body, /Tidak ada proses QA yang sedang berjalan/);
  assert.equal(status.interactive[0].buttons.length, 3);
  resolveRun(successfulReport());
  await new Promise(resolve => setTimeout(resolve, 30));
});


test('final-result delivery falls back to plain text if interactive transport is unavailable', async () => {
  const plugin = createTestCommandsPlugin({ runVerification: async () => successfulReport() });
  const replies = [];
  const ctx = {
    isOwner: true, args: ['run'], prefix: '.',
    reply: async text => { replies.push(String(text)); return true; },
    sendInteractive: async () => { throw new Error('interactive transport unavailable'); },
  };
  await plugin.execute(ctx);
  for (let attempt = 0; attempt < 20 && !replies.some(text => text.includes('FULL TEST LULUS')); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(replies.some(text => text.includes('WHISKAY FULL VERIFICATION DIMULAI')));
  assert.ok(replies.some(text => text.includes('FULL TEST LULUS')));
});


test('testcommands emits live per-test progress and keeps the run marked active until final result', async () => {
  let finish;
  const deferred = new Promise(resolve => { finish = resolve; });
  const plugin = createTestCommandsPlugin({ runVerification: async options => {
    options.onProgress?.({ type: 'start', id: 'QA-LIVE-001' });
    options.onProgress?.({ type: 'step-start', id: 'QA-LIVE-001', step: 'npm-test', message: 'test' });
    options.onProgress?.({ type: 'test-discovery', step: 'npm-test', files: 79, ignored: ['sessions/', 'node_modules/'], isolated: true });
    options.onProgress?.({ type: 'test-progress', step: 'npm-test', counts: { completed: 5, discovered: 12, passed: 4, failed: 1 }, latest: { type: 'fail', name: 'fixture failure' } });
    return deferred;
  } });
  const run = makeContext({ args: ['run'] });
  await plugin.execute(run.ctx);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(run.interactive.some(item => item.title === '🧭 TEST DISCOVERY SELESAI'));
  assert.ok(run.interactive.some(item => item.title === '⚠️ QA MENEMUKAN TEST GAGAL'));
  const status = makeContext({ args: ['progress'] });
  await plugin.execute(status.ctx);
  assert.match(status.interactive[0].body, /5 selesai/);
  assert.match(status.interactive[0].body, /4 lulus/);
  assert.match(status.interactive[0].body, /1 gagal/);
  finish(successfulReport());
  await new Promise(resolve => setTimeout(resolve, 30));
});

test('status and report screens expose actionable native-flow buttons', async () => {
  const plugin = createTestCommandsPlugin({
    runVerification: async () => successfulReport(),
    readText: async () => '# SUCCESS REPORT\nAll gates passed.',
    getStat: async () => ({ mtime: new Date('2026-10-31T00:00:00Z') }),
    readDirectory: async () => ['WHISKAY-VERIFY-FAILURE-old.zip'],
  });
  const status = makeContext({ args: ['status'] });
  await plugin.execute(status.ctx);
  assert.equal(status.interactive.length, 1);
  assert.equal(status.interactive[0].buttons.length, 3);
  assert.ok(status.interactive[0].buttons.some(button => button.id === '.testcommands download'));
  assert.match(status.interactive[0].body, /ZIP diagnostik terakhir/);
  assert.doesNotMatch(status.interactive[0].body, /📊 WHISKAY QA STATUS/);
  assert.doesNotMatch(status.interactive[0].body, /Tidak ada proses QA yang sedang berjalan/);

  const report = makeContext({ args: ['report'] });
  await plugin.execute(report.ctx);
  assert.equal(report.interactive.length, 1);
  assert.match(report.interactive[0].body, /All gates passed/);
  assert.equal(report.interactive[0].buttons.length, 3);
});

test('unknown action returns an interactive help panel instead of a text-only dead end', async () => {
  const plugin = createTestCommandsPlugin({ runVerification: async () => successfulReport() });
  const { ctx, interactive } = makeContext({ args: ['wat'] });
  await plugin.execute(ctx);
  assert.equal(interactive.length, 1);
  assert.match(interactive[0].title, /TIDAK DIKENAL/);
  assert.equal(interactive[0].buttons.length, 3);
});


test('failure status offers one-tap diagnostic download and sends ZIP as a document', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-testcommands-download-'));
  const diagnosticDir = path.join(root, 'test', 'reports', 'diagnostics');
  await mkdir(diagnosticDir, { recursive: true });
  const fileName = 'WHISKAY-VERIFY-FAILURE-fixture.zip';
  const bytes = Buffer.from('PK\\x03\\x04fixture');
  await writeFile(path.join(diagnosticDir, fileName), bytes);
  const sent = [];
  const ctx = {
    command: 'testcommands', args: ['download'], prefix: '.', chat: '628000000000@s.whatsapp.net',
    isOwner: true, sock: { async sendMessage(jid, payload, options) { sent.push({ jid, payload, options }); return { key: { id: 'sent' } }; } },
    async reply(text) { return text; }, async sendInteractive(payload) { sent.push({ interactive: payload }); return payload; },
  };
  try {
    const plugin = createTestCommandsPlugin({ projectRoot: root });
    await plugin.execute(ctx);
    const document = sent.find(row => row.payload?.document);
    assert.ok(document, 'diagnostic ZIP should be sent as a WhatsApp document');
    assert.equal(document.payload.fileName, fileName);
    assert.equal(document.payload.mimetype, 'application/zip');
    assert.deepEqual(document.payload.document, bytes);
    assert.ok(sent.some(row => row.interactive?.title === '✅ ZIP DIAGNOSTIK TERKIRIM'));
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('diagnostic download sends latest ZIP as WhatsApp document and confirms delivery', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-testcommands-download-'));
  const diagnosticDir = path.join(root, 'test', 'reports', 'diagnostics');
  await mkdir(diagnosticDir, { recursive: true });
  const fileName = 'WHISKAY-VERIFY-FAILURE-fixture.zip';
  const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x66, 0x69, 0x78]);
  await writeFile(path.join(diagnosticDir, fileName), bytes);
  const sent = [];
  const ctx = {
    isOwner: true, args: ['download'], command: 'testcommands', prefix: '.',
    chat: '628000000000@s.whatsapp.net',
    sock: { async sendMessage(jid, payload, options) { sent.push({ jid, payload, options }); return { key: { id: 'sent' } }; } },
    async reply(text) { sent.push({ text }); return true; },
    async sendInteractive(payload) { sent.push({ interactive: payload }); return true; },
  };
  try {
    const plugin = createTestCommandsPlugin({ projectRoot: root });
    await plugin.execute(ctx);
    const document = sent.find(row => row.payload?.document);
    assert.ok(document, 'ZIP should be sent as a WhatsApp document');
    assert.equal(document.payload.fileName, fileName);
    assert.equal(document.payload.mimetype, 'application/zip');
    assert.deepEqual(document.payload.document, bytes);
    assert.ok(sent.some(row => row.interactive?.title === '✅ ZIP DIAGNOSTIK TERKIRIM'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

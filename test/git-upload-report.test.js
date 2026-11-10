import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZipBuffer, parseTestSummary, extractFailureLines } from '../scripts/testcommand-runner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readZipEntries(buffer) {
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) break;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const method = buffer.readUInt16LE(offset + 8);
    const compressed = buffer.subarray(dataStart, dataEnd);
    const data = method === 8 ? inflateRawSync(compressed) : (method === 0 ? compressed : null);
    if (data) entries.set(name, data.toString('utf8'));
    offset = dataEnd;
  }
  return entries;
}

test('Git Upload parses compact Whiskay npm-test counters', () => {
  assert.deepEqual(
    parseTestSummary('WHISKAY TEST RESULT: FAIL\nTest: 437/444 lulus · 7 gagal · 0 skip\n'),
    { tests: 444, passed: 437, failed: 7, skipped: 0, cancelled: null },
  );
});

test('Git Upload includes concise [FAIL] progress lines in its report', () => {
  const result = extractFailureLines('[FAIL] dry-run fixture — test/git-upload.test.js:44 — missing intelligence script');
  assert.match(result, /dry-run fixture/);
  assert.match(result, /missing intelligence script/);
});

test('Git Upload report embeds failures.md from the nested npm-test ZIP', { skip: process.platform === 'win32' }, async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'whiskay-git-upload-report-'));
  const project = path.join(parent, 'project');
  try {
    await mkdir(path.join(project, 'scripts'), { recursive: true });
    await mkdir(path.join(project, 'data', 'test-reports', 'logs'), { recursive: true });
    await cp(path.join(ROOT, 'scripts', 'git-upload-report.mjs'), path.join(project, 'scripts', 'git-upload-report.mjs'));
    await cp(path.join(ROOT, 'scripts', 'testcommand-runner.mjs'), path.join(project, 'scripts', 'testcommand-runner.mjs'));
    await writeFile(path.join(project, 'package.json'), JSON.stringify({ name: 'git-upload-report-fixture', version: '2.35.22' }));
    const nestedPath = path.join(project, 'data', 'test-reports', 'npm-test-fixture.zip');
    await writeFile(nestedPath, createZipBuffer([
      { name: 'summary.json', data: JSON.stringify({ status: 'FAIL', counts: { tests: 444, passed: 437, failed: 7, skipped: 0, cancelled: 0 } }) },
      { name: 'failures.md', data: '# Detailed test failures\n\nTotal test gagal: **7**\n\n## Missing fixture module\n\n`git-upload-intelligence.mjs` tidak disalin ke sandbox.\n' },
    ]));
    const logDir = path.join(project, 'data', 'test-reports', 'logs');
    await writeFile(path.join(logDir, 'npm-test.log'), 'WHISKAY TEST RESULT: FAIL\nTest: 437/444 lulus · 7 gagal · 0 skip\nREPORT_ZIP=data/test-reports/npm-test-fixture.zip\n[FAIL] missing fixture module — test/git-upload.test.js:12 — git-upload-intelligence.mjs\n');
    await writeFile(path.join(logDir, 'qa-output.log'), 'NPM_TEST_RESULT=FAIL\nNPM_AUDIT_RESULT=PASS\n');
    const result = spawnSync(process.execPath, ['scripts/git-upload-report.mjs', '--run-id=fixture', '--qa-status=FAIL', '--log-dir=data/test-reports/logs'], { cwd: project, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const report = await readFile(path.join(project, 'data', 'test-reports', 'git-upload-fixture.md'), 'utf8');
    assert.match(report, /Test ditemukan\/terhitung: 444/);
    assert.match(report, /Lulus: 437/);
    assert.match(report, /Gagal: 7/);
    assert.match(report, /Total test gagal: \*\*7\*\*/);
    assert.match(report, /git-upload-intelligence\.mjs/);
    assert.match(report, /npm audit \(high\/critical\)/);
    const outer = await readFile(path.join(project, 'data', 'test-reports', 'git-upload-fixture.zip'));
    assert.ok(readZipEntries(outer).has('test-artifacts/npm-test-fixture.zip'));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

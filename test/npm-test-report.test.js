import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Build synthetic API-key-like values at runtime so repository secret scanners
// do not mistake this redaction fixture for a real credential.
const actualSecret = ['sk', 'secret', 'actual', '1234567890'].join('-');
const expectedSecret = ['sk', 'secret', 'expected', '0987654321'].join('-');
const actualSecretMarker = ['sk', 'secret', 'actual'].join('-');
const expectedSecretMarker = ['sk', 'secret', 'expected'].join('-');

function readZipEntries(zip) {
  const entries = new Map();
  let offset = 0;
  while (offset + 4 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = zip.subarray(nameStart, nameStart + nameLength).toString('utf8');
    entries.set(name, inflateRawSync(zip.subarray(dataStart, dataStart + compressedSize)).toString('utf8'));
    offset = dataStart + compressedSize;
  }
  return entries;
}

async function createFixture({ failing = false } = {}) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'whiskay-npm-report-'));
  const project = path.join(parent, 'project');
  await mkdir(path.join(project, 'scripts'), { recursive: true });
  await mkdir(path.join(project, 'test'), { recursive: true });
  for (const file of ['run-tests.mjs', 'testcommand-reporter.mjs', 'testcommand-runner.mjs']) {
    await cp(path.join(ROOT, 'scripts', file), path.join(project, 'scripts', file));
  }
  await writeFile(path.join(project, 'package.json'), JSON.stringify({
    name: 'whiskay-report-fixture', version: '1.0.0', type: 'module',
    scripts: { test: 'node scripts/run-tests.mjs' },
  }, null, 2));
  const testBody = failing
    ? `import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('failure includes source details', () => {\n  assert.equal('OPENAI_API_KEY=${actualSecret}', 'OPENAI_API_KEY=${expectedSecret}');\n});\n`
    : "import test from 'node:test';\ntest('fixture passes', () => {});\n";
  await writeFile(path.join(project, 'test', 'sample.test.js'), testBody);
  return { parent, project };
}

test('npm test creates a readable PASS ZIP report in data/test-reports', { skip: process.platform === 'win32' }, async () => {
  const fixture = await createFixture();
  try {
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['scripts/run-tests.mjs'], { cwd: fixture.project, env, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const reportPath = result.stdout.match(/^REPORT_ZIP=(.+)$/m)?.[1];
    assert.ok(reportPath, `${result.stdout}\n${result.stderr}`);
    const zip = await readFile(path.join(fixture.project, reportPath));
    const entries = readZipEntries(zip);
    assert.match(entries.get('README-REPORT.md'), /Status: \*\*PASS\*\*/);
    assert.equal(JSON.parse(entries.get('summary.json')).counts.passed, 1);
    assert.match(entries.get('discovered-tests.txt'), /test\/sample\.test\.js/);
    assert.match(entries.get('events.jsonl'), /"type":"summary"/);
    assert.match(entries.get('failures.md'), /Tidak ada test yang dilaporkan gagal/);
    assert.ok((await readdir(path.join(fixture.project, 'data', 'test-reports'))).some(name => name.endsWith('.zip')));
  } finally {
    await rm(fixture.parent, { recursive: true, force: true });
  }
});

test('npm test creates a FAIL ZIP with stack, expected/actual and source excerpt', { skip: process.platform === 'win32' }, async () => {
  const fixture = await createFixture({ failing: true });
  try {
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['scripts/run-tests.mjs'], { cwd: fixture.project, env, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    const reportPath = result.stdout.match(/^REPORT_ZIP=(.+)$/m)?.[1];
    assert.ok(reportPath, `${result.stdout}\n${result.stderr}`);
    const zip = await readFile(path.join(fixture.project, reportPath));
    const entries = readZipEntries(zip);
    const summary = JSON.parse(entries.get('summary.json'));
    assert.equal(summary.status, 'FAIL');
    assert.equal(summary.counts.failed, 1);
    assert.match(entries.get('failures.md'), /failure includes source details/);
    assert.doesNotMatch(entries.get('failures.md'), new RegExp(actualSecretMarker));
    assert.doesNotMatch(entries.get('failures.json'), new RegExp(actualSecretMarker));
    assert.doesNotMatch(entries.get('events.jsonl'), new RegExp(actualSecretMarker));
    assert.doesNotMatch(entries.get('failures.md'), new RegExp(expectedSecretMarker));
    assert.doesNotMatch(entries.get('failures.json'), new RegExp(expectedSecretMarker));
    assert.doesNotMatch(entries.get('events.jsonl'), new RegExp(expectedSecretMarker));
    for (const line of entries.get('events.jsonl').trim().split(/\r?\n/)) assert.doesNotThrow(() => JSON.parse(line));
    assert.match(entries.get('failures.md'), /sample\.test\.js/);
    assert.match(entries.get('source-excerpts.json'), /assert\.equal/);
  } finally {
    await rm(fixture.parent, { recursive: true, force: true });
  }
});

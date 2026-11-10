import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, chmod, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import {
  createZipBuffer,
  extractFailureLines,
  parseFailureLocations,
  parseTestSummary,
  classifyFailure,
  redactText,
  shouldCopyProjectPath,
  runRepositoryVerification,
} from '../scripts/testcommand-runner.mjs';

function readZipEntries(zip) {
  const actual = new Map();
  let offset = 0;
  while (offset + 4 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = zip.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const content = inflateRawSync(zip.subarray(dataStart, dataStart + compressedSize));
    actual.set(name, content);
    offset = dataStart + compressedSize;
  }
  return actual;
}

async function createMockNpmProject(mode) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'whiskay-runner-integration-'));
  const project = path.join(parent, 'project');
  const bin = path.join(parent, 'mock-bin');
  await mkdir(path.join(project, 'src'), { recursive: true });
  await mkdir(path.join(project, 'test'), { recursive: true });
  await mkdir(bin, { recursive: true });
  await writeFile(path.join(project, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', scripts: { 'verify:all': 'fixture' } }));
  await writeFile(path.join(project, 'package-lock.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'fixture', version: '1.0.0' } } }));
  await writeFile(path.join(project, 'src', 'sample.js'), 'export const valid = true;\n');
  await writeFile(path.join(project, 'test', 'sample.test.js'), "import test from 'node:test';\ntest('fixture source line', () => {\n  if (false) throw new Error('never');\n});\n");
  const npmScript = `#!/bin/sh
case "$1" in
  ci)
    echo "mock npm ci success"
    exit 0
    ;;
  run)
    if [ "$MOCK_NPM_MODE" = "failure" ]; then
      echo "not ok 1 - mocked verify all regression"
      echo "  at TestContext.<anonymous> ($PWD/test/sample.test.js:3:2)"
      echo "ℹ tests 1"
      echo "ℹ pass 0"
      echo "ℹ fail 1"
      exit 1
    fi
    echo "ok 1 - mock gate one"
    echo "ok 2 - mock gate two"
    echo "ℹ tests 3"
    echo "ℹ pass 3"
    echo "ℹ fail 0"
    exit 0
    ;;
  test)
    echo '{"source":"whiskay-run-tests","type":"preflight","discoveredFiles":1,"ignored":["sessions/","node_modules/"],"isolated":true}'
    echo '{"source":"whiskay-node-test","type":"discovered","counts":{"discovered":1,"completed":0,"passed":0,"failed":0,"skipped":0},"name":"fixture one"}'
    echo '{"source":"whiskay-node-test","type":"pass","counts":{"discovered":1,"completed":1,"passed":1,"failed":0,"skipped":0},"name":"fixture one"}'
    echo '{"source":"whiskay-node-test","type":"summary","counts":{"discovered":1,"completed":1,"passed":1,"failed":0,"skipped":0},"tests":1,"passed":1,"failed":0,"skipped":0}'
    exit 0
    ;;
esac
exit 2
`;
  const npmPath = path.join(bin, 'npm');
  await writeFile(npmPath, npmScript, { mode: 0o755 });
  await chmod(npmPath, 0o755);
  return { parent, project, bin, mode };
}

async function withMockNpm(fixture, callback) {
  const previousPath = process.env.PATH;
  const previousMode = process.env.MOCK_NPM_MODE;
  process.env.PATH = `${fixture.bin}${path.delimiter}${previousPath || ''}`;
  process.env.MOCK_NPM_MODE = fixture.mode;
  try { return await callback(); }
  finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousMode === undefined) delete process.env.MOCK_NPM_MODE;
    else process.env.MOCK_NPM_MODE = previousMode;
  }
}

test('testcommand parses precise absolute stack locations into project-relative file, line and column', () => {
  const root = path.resolve('/tmp/whiskay-test-root');
  const output = [
    `  at TestContext.<anonymous> (file://${root}/test/stage32-regression.test.js:53:10)`,
    `test at ${root}/src/plugins/owner/testcommands.js:144:7`,
  ].join('\n');
  const locations = parseFailureLocations(output, root);
  assert.deepEqual(locations.slice(0, 2), [
    { file: 'test/stage32-regression.test.js', line: 53, column: 10, source: 'stack-or-runner-output' },
    { file: 'src/plugins/owner/testcommands.js', line: 144, column: 7, source: 'stack-or-runner-output' },
  ]);
});

test('testcommand aggregates TAP counters across nested verify:all invocations', () => {
  const output = ['ℹ tests 4', 'ℹ pass 4', 'ℹ fail 0', 'ℹ tests 7', 'ℹ pass 5', 'ℹ fail 2'].join('\n');
  assert.deepEqual(parseTestSummary(output), { tests: 11, passed: 9, failed: 2, skipped: null, cancelled: null });
});

test('testcommand reads machine-readable reporter summary without losing exact totals', () => {
  const output = JSON.stringify({ source: 'whiskay-node-test', type: 'summary', tests: 352, passed: 337, failed: 15, skipped: 0, counts: { completed: 352 } });
  assert.deepEqual(parseTestSummary(output), { tests: 352, passed: 337, failed: 15, skipped: 0, cancelled: null });
});

test('testcommand classifies private database/session guards as critical upload blockers', () => {
  const classification = classifyFailure('BLOCK still tracked: data/leveling.json\nUPLOAD BLOCKED: database/session must remain local');
  assert.equal(classification?.code, 'PRIVATE_DATA_GUARD_BLOCKED');
  assert.equal(classification?.severity, 'critical');
  assert.equal(classification?.category, 'SECURITY');
  assert.match(extractFailureLines('UPLOAD BLOCKED: database/session must remain local'), /UPLOAD BLOCKED/);
});

test('testcommand classifies a missing Baileys pre-key separately from assertion failures', () => {
  const classification = classifyFailure("Could not find '/root/whiskay-bot/sessions/pre-key-3631.json'");
  assert.equal(classification.code, 'BAILEYS_PREKEY_FILE_MISSING');
  assert.equal(classification.category, 'SESSION_RUNTIME_REFERENCE');
  assert.match(classification.recommendedAction, /mock auth state/i);
  assert.equal(classifyFailure('AssertionError: expected true'), null);
});

test('testcommand extracts TAP failures and Node test summary counters', () => {
  const output = [
    'not ok 3 - energy middleware rejects paid command at zero energy',
    '  error: AssertionError [ERR_ASSERTION]: expected true',
    '  at TestContext.<anonymous> (test/energy.test.js:41:9)',
    'ℹ tests 12',
    'ℹ pass 10',
    'ℹ fail 1',
    'ℹ skipped 1',
  ].join('\n');
  assert.deepEqual(parseTestSummary(output), { tests: 12, passed: 10, failed: 1, skipped: 1, cancelled: null });
  assert.match(extractFailureLines(output), /not ok 3 - energy middleware/);
  assert.match(extractFailureLines(output), /AssertionError/);
});

test('testcommand sandbox filter excludes live credentials and state but retains sample env and static dungeon assets', () => {
  const root = path.resolve('/tmp/whiskay-project');
  const include = rel => shouldCopyProjectPath(path.join(root, rel), root);
  assert.equal(include('.env'), false);
  assert.equal(include('.env.production'), false);
  assert.equal(include('.env.example'), true);
  assert.equal(include('.npmrc'), false);
  assert.equal(include('node_modules/baileys/index.js'), false);
  assert.equal(include('sessions/auth.json'), false);
  assert.equal(include('session/auth.json'), false);
  assert.equal(include('.wwebjs_auth/Default/creds.json'), false);
  assert.equal(include('baileys_auth_info/creds.json'), false);
  assert.equal(include('data/user-profiles.json'), false);
  assert.equal(include('data/dungeon/floors.json'), false);
  assert.equal(include('cache.sqlite-wal'), false);
  assert.equal(include('nested/credentials.json'), false);
  assert.equal(include('nested/service-account-prod.json'), false);
  assert.equal(include('nested/.env.example'), false);
  assert.equal(include('app.log.1'), false);
  assert.equal(include('assets/dungeon/floors.json'), true);
  assert.equal(include('src/plugins/owner/testcommands.js'), true);
});

test('testcommand redacts common credential assignments from archived logs', () => {
  const clean = redactText('OPENAI_API_KEY=sk-private-token Authorization: Bearer abc.def.ghi');
  assert.doesNotMatch(clean, /sk-private-token|abc\.def\.ghi/);
  assert.match(clean, /\[REDACTED\]/);
});

test('testcommand creates a valid ZIP container with UTF-8 entry names and readable compressed payloads', () => {
  const expected = [
    { name: 'README-DIAGNOSTIC.md', data: '# Diagnostic' },
    { name: 'logs/verify-all.stdout.log', data: 'not ok 1 - sample' },
    { name: 'source-context/src/plugins/owner/testcommands.js', data: 'line 1\nline 2' },
  ];
  const zip = createZipBuffer(expected);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  const actual = readZipEntries(zip);
  for (const entry of expected) assert.equal(actual.get(entry.name).toString('utf8'), entry.data);
});

test('testcommand failure pipeline creates a ZIP with exact line/column and keeps running npm test', { skip: process.platform === 'win32' }, async () => {
  const fixture = await createMockNpmProject('failure');
  try {
    const events = [];
    const report = await withMockNpm(fixture, () => runRepositoryVerification({ projectRoot: fixture.project, onProgress: event => events.push(event) }));
    assert.equal(report.status, 'FAILED');
    assert.ok(events.some(event => event.type === 'test-discovery' && event.files === 1 && event.isolated));
    assert.ok(events.some(event => event.type === 'test-progress' && event.step === 'npm-test' && event.counts.passed === 1));
    assert.equal(report.steps.find(step => step.name === 'npm-ci')?.ok, true);
    assert.equal(report.steps.find(step => step.name === 'verify-all')?.ok, false);
    assert.equal(report.steps.find(step => step.name === 'npm-test')?.ok, true);
    assert.ok(report.failureArchivePath);
    assert.ok(report.failureLocations.some(item => item.file === 'test/sample.test.js' && item.line === 3 && item.column === 2));
    const zip = await readFile(path.join(fixture.project, report.failureArchivePath));
    const entries = readZipEntries(zip);
    assert.match(entries.get('README-DIAGNOSTIC.md').toString('utf8'), /test\/sample\.test\.js:3:2/);
    assert.match(entries.get('logs/verify-all.stdout.log').toString('utf8'), /not ok 1 - mocked verify all regression/);
    assert.match(entries.get('source-excerpts.json').toString('utf8'), /"focusLine": 3/);
  } finally {
    await rm(fixture.parent, { recursive: true, force: true });
  }
});

test('testcommand success pipeline writes the dedicated success report only after every phase passes', { skip: process.platform === 'win32' }, async () => {
  const fixture = await createMockNpmProject('success');
  try {
    const events = [];
    const report = await withMockNpm(fixture, () => runRepositoryVerification({ projectRoot: fixture.project, onProgress: event => events.push(event) }));
    assert.equal(report.status, 'SUCCESS');
    assert.deepEqual(report.steps.find(step => step.name === 'npm-test')?.summary, { tests: 1, passed: 1, failed: 0, skipped: 0, cancelled: null });
    assert.ok(events.some(event => event.type === 'test-progress' && event.counts.completed === 1));
    assert.ok(report.steps.every(step => step.ok));
    assert.equal(report.syntax.failed, 0);
    assert.equal(report.successReportPath, 'test/reports/WHISKAY-VERIFY-SUCCESS.md');
    const success = await readFile(path.join(fixture.project, report.successReportPath), 'utf8');
    assert.match(success, /LAST SUCCESSFUL FULL VERIFICATION/);
    assert.match(success, /npm ci/);
    assert.match(success, /npm run verify:all/);
    assert.match(success, /npm test/);
    await assert.rejects(readFile(path.join(fixture.project, 'test/reports/diagnostics')));
    assert.deepEqual(await readdir(path.join(fixture.project, 'test/reports')), ['WHISKAY-VERIFY-SUCCESS.md']);
  } finally {
    await rm(fixture.parent, { recursive: true, force: true });
  }
});

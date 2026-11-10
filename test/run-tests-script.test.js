import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { discoverTestFiles, buildNodeTestArgs, inspectRequiredDependencies } from '../scripts/run-tests.mjs';

test('npm test discovery is confined to test/ and ignores sessions, node_modules and symlinks', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-test-discovery-'));
  try {
    for (const dir of ['test/unit', 'test/node_modules/fake', 'test/sessions', 'node_modules/fake', 'sessions']) {
      await mkdir(path.join(root, dir), { recursive: true });
    }
    await writeFile(path.join(root, 'test/unit/example.test.js'), '');
    await writeFile(path.join(root, 'test/node_modules/fake/ignored.test.js'), '');
    await writeFile(path.join(root, 'test/sessions/ignored.test.js'), '');
    await writeFile(path.join(root, 'node_modules/fake/outside.test.js'), '');
    await writeFile(path.join(root, 'sessions/outside.test.js'), '');
    await writeFile(path.join(root, 'test/notes.md'), 'not a test');
    try { await symlink(path.join(root, 'sessions'), path.join(root, 'test', 'linked-sessions'), 'dir'); } catch {}
    assert.deepEqual(await discoverTestFiles(root), ['test/unit/example.test.js']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('npm test runner forwards supported reporter flags and only explicit discovered test paths', () => {
  assert.deepEqual(buildNodeTestArgs(['test/a.test.js', 'test/nested/b.test.mjs'], ['--test-reporter=./scripts/testcommand-reporter.mjs']), [
    '--test', '--test-reporter=./scripts/testcommand-reporter.mjs', 'test/a.test.js', 'test/nested/b.test.mjs',
  ]);
  assert.throws(() => buildNodeTestArgs(['test/a.test.js'], ['sessions/pre-key-1.json']), /tidak diizinkan/i);
  assert.throws(() => buildNodeTestArgs(['test/a.test.js'], ['--test-reporter']), /membutuhkan nilai/i);
});


test('npm test preflight reports missing direct dependencies before running tests', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-test-dependency-preflight-'));
  try {
    await mkdir(path.join(root, 'node_modules', 'dotenv'), { recursive: true });
    await writeFile(path.join(root, 'node_modules', 'dotenv', 'package.json'), JSON.stringify({ name: 'dotenv', version: '1.0.0' }));
    const missing = await inspectRequiredDependencies(root, ['dotenv', 'baileys']);
    assert.deepEqual(missing, ['baileys']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { packageVersionCheck, inspectDependencies, validateDeployment, healthSnapshot, simulateRecovery } from '../scripts/production-readiness.mjs';

test('package and lock versions must match', () => {
  assert.equal(packageVersionCheck({ version: '2.35.31' }, { packages: { '': { version: '2.35.31' } } }).ok, true);
  assert.equal(packageVersionCheck({ version: '2.35.31' }, { packages: { '': { version: '2.35.30' } } }).ok, false);
});

test('dependency inspection reports missing packages explicitly', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-deps-'));
  try {
    const result = await inspectDependencies(root, ['fake-dependency']);
    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, ['fake-dependency']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('deployment validation rejects missing required files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-deploy-'));
  try {
    const result = await validateDeployment(root);
    assert.equal(result.ok, false);
    assert.ok(result.checks.some(check => check.name === 'required:package.json' && !check.ok));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('health snapshot reports runtime identity and dependency status', async () => {
  const result = await healthSnapshot(process.cwd());
  assert.equal(typeof result.timestamp, 'string');
  assert.equal(typeof result.checks.pid, 'number');
  assert.equal(typeof result.checks.dependencies.ok, 'boolean');
});

test('recovery simulation restores a corrupt primary from verified backup', async () => {
  const result = await simulateRecovery();
  assert.equal(result.ok, true);
  assert.equal(result.scenario, 'corrupt-primary-restored-from-verified-backup');
});

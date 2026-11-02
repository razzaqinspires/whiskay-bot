import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Stage 54 integrity audit passes for the repository', () => {
  const output = execFileSync(process.execPath, ['scripts/repository-integrity.mjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(output, /Repository integrity: PASS/);
  assert.match(output, /package-lock consistency: PASS/);
});

test('archived patch files are local-only and ignored by Git', () => {
  const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.match(ignore, /docs\/archive\/patches\/\*\.patch/);
});

test('Stage 54 npm scripts are registered', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['verify:stage54'], 'node --test test/stage54-repository-integrity.test.js');
  assert.equal(pkg.scripts['audit:repository'], 'node scripts/repository-integrity.mjs');
});

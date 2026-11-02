import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('Stage 56 recognizes a moved root shell script and removes only its near-identical legacy duplicate', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'whiskay-stage56-'));
  try {
    git(dir, ['init']); git(dir, ['config', 'user.name', 'Test']); git(dir, ['config', 'user.email', 'test@example.invalid']);
    const source = '#!/usr/bin/env bash\nset -euo pipefail\nprintf "Whiskay upload\\n"\n# canonical workflow\n';
    writeFileSync(path.join(dir, 'git-upload.sh'), source);
    git(dir, ['add', 'git-upload.sh']); git(dir, ['commit', '-m', 'legacy root script']);
    mkdirSync(path.join(dir, 'scripts'));
    writeFileSync(path.join(dir, 'scripts/git-upload.sh'), source.replace('# canonical workflow', '# canonical workflow updated'));
    const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/git-upload-intelligence.mjs'), '--analyze'], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(existsSync(path.join(dir, 'git-upload.sh')), false);
    assert.equal(existsSync(path.join(dir, 'scripts/git-upload.sh')), true);
    assert.match(result.stdout, /REMOVED_DUPLICATE_ROOT_COPY/);
    git(dir, ['add', '-A']);
    const summary = git(dir, ['diff', '--cached', '--find-renames', '--summary']);
    assert.match(summary, /rename .*git-upload\.sh/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('Stage 56 understands staged-add then worktree-delete (AD) move state', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'whiskay-stage56-ad-'));
  try {
    git(dir, ['init']); git(dir, ['config', 'user.name', 'Test']); git(dir, ['config', 'user.email', 'test@example.invalid']);
    mkdirSync(path.join(dir, 'scripts'));
    const staged = '#!/bin/sh\necho whiskay\nrun_checks\n';
    writeFileSync(path.join(dir, 'legacy.sh'), staged);
    git(dir, ['add', 'legacy.sh']);
    writeFileSync(path.join(dir, 'scripts/legacy.sh'), staged.replace('run_checks', 'run_checks --strict'));
    unlinkSync(path.join(dir, 'legacy.sh'));
    const status = git(dir, ['status', '--short']);
    assert.match(status, /A.*legacy\.sh/);
    assert.match(status, /\?\? scripts\//);
    const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/git-upload-intelligence.mjs'), '--analyze'], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /REMOVED_DUPLICATE_ROOT_COPY/);
    assert.equal(existsSync(path.join(dir, 'legacy.sh')), false);
    assert.equal(existsSync(path.join(dir, 'scripts/legacy.sh')), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Stage 56 never auto-deletes a dissimilar root script', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'whiskay-stage56-'));
  try {
    git(dir, ['init']); git(dir, ['config', 'user.name', 'Test']); git(dir, ['config', 'user.email', 'test@example.invalid']);
    writeFileSync(path.join(dir, 'deploy.sh'), '#!/bin/sh\necho deploy\n');
    git(dir, ['add', 'deploy.sh']); git(dir, ['commit', '-m', 'root script']);
    mkdirSync(path.join(dir, 'scripts'));
    writeFileSync(path.join(dir, 'scripts/deploy.sh'), '#!/bin/sh\necho totally-different\nexit 99\n');
    const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/git-upload-intelligence.mjs'), '--analyze'], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 12);
    assert.equal(existsSync(path.join(dir, 'deploy.sh')), true);
    assert.match(result.stdout, /REVIEW_REQUIRED_NO_DELETE/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Stage 56 upload launcher performs history intelligence before snapshot and sync', () => {
  const launcher = readFileSync(path.join(ROOT, 'scripts/git-upload.sh'), 'utf8');
  const helper = readFileSync(path.join(ROOT, 'scripts/git-upload-intelligence.mjs'), 'utf8');
  assert.ok(launcher.indexOf('git-upload-intelligence.mjs --analyze') < launcher.indexOf('auto-push.sh --snapshot'));
  assert.ok(launcher.indexOf('auto-push.sh --snapshot') < launcher.indexOf('git merge --no-edit'));
  assert.match(helper, /--find-renames/);
  assert.match(helper, /similarity/);
  assert.match(helper, /REVIEW_REQUIRED_NO_DELETE/);
  assert.match(helper, /run\(\['rm', '--cached', '-f'/);
});

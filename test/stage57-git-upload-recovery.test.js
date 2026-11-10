import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(root, relative), 'utf8');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('Stage 57 reports pending lineage and patch-equivalent commits without rewriting history', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-stage57-'));
  try {
    git(dir, 'init', '-b', 'main');
    git(dir, 'config', 'user.name', 'Stage 57 Test');
    git(dir, 'config', 'user.email', 'stage57@example.invalid');
    await writeFile(path.join(dir, 'base.txt'), 'base\n');
    git(dir, 'add', '.'); git(dir, 'commit', '-m', 'base');
    const bare = `${dir}-origin.git`;
    git(dir, 'clone', '--bare', dir, bare);
    git(dir, 'remote', 'add', 'origin', bare);
    git(dir, 'fetch', 'origin');
    git(dir, 'switch', '-c', 'upload/recovery-test');
    await writeFile(path.join(dir, 'feature.txt'), 'feature\n');
    git(dir, 'add', '.'); git(dir, 'commit', '-m', 'feature');
    const before = git(dir, 'rev-parse', 'HEAD');
    const script = path.join(root, 'scripts/git-upload-recovery.mjs');
    const result = spawnSync(process.execPath, [script, '--analyze'], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /COMMITS_AHEAD=1/);
    assert.match(result.stdout, /UNIQUE_PATCHES_PENDING=1/);
    assert.match(result.stdout, /RECOVERY_STATUS=READY_TO_PUBLISH/);
    assert.equal(git(dir, 'rev-parse', 'HEAD'), before, 'audit must not rewrite commits');
  } finally { await rm(dir, { recursive: true, force: true }); await rm(`${dir}-origin.git`, { recursive: true, force: true }); }
});

test('Stage 57 blocks an empty PR when every pending commit patch already exists in base', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-stage57-duplicate-'));
  try {
    git(dir, 'init', '-b', 'main');
    git(dir, 'config', 'user.name', 'Stage 57 Test');
    git(dir, 'config', 'user.email', 'stage57@example.invalid');
    await writeFile(path.join(dir, 'base.txt'), 'base\n');
    git(dir, 'add', '.'); git(dir, 'commit', '-m', 'base');
    const baseCommit = git(dir, 'rev-parse', 'HEAD');
    const bare = `${dir}-origin.git`;
    git(dir, 'clone', '--bare', dir, bare);
    git(dir, 'remote', 'add', 'origin', bare);
    await writeFile(path.join(dir, 'same.txt'), 'identical patch\n');
    git(dir, 'add', '.'); git(dir, 'commit', '-m', 'feature already upstream');
    git(dir, 'push', 'origin', 'main');
    git(dir, 'fetch', 'origin');
    git(dir, 'switch', '-c', 'upload/duplicate-patch', baseCommit);
    await writeFile(path.join(dir, 'same.txt'), 'identical patch\n');
    git(dir, 'add', '.'); git(dir, 'commit', '-m', 'same patch under another commit');
    const script = path.join(root, 'scripts/git-upload-recovery.mjs');
    const result = spawnSync(process.execPath, [script, '--check-publish'], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 13);
    assert.match(result.stdout, /PATCHES_ALREADY_IN_BASE=1/);
    assert.match(result.stderr, /PUBLISH_BLOCKED=ALL_PENDING_COMMITS_ALREADY_IN_BASE/);
  } finally { await rm(dir, { recursive: true, force: true }); await rm(`${dir}-origin.git`, { recursive: true, force: true }); }
});

test('Stage 57 upload launcher resumes the existing upload branch instead of rejecting it or creating another', async () => {
  const launcher = await read('scripts/git-upload.sh');
  assert.match(launcher, /SOURCE_BRANCH.*upload\/\*/);
  assert.match(launcher, /Melanjutkan branch upload yang sudah ada/);
  assert.match(launcher, /CREATED_UPLOAD_BRANCH=0/);
  assert.match(launcher, /if \(\(CREATED_UPLOAD_BRANCH\)\); then/);
  assert.match(launcher, /git-upload-recovery\.mjs --analyze/);
  assert.match(launcher, /git-upload-recovery\.mjs --check-publish/);
  assert.match(launcher, /Branch upload dipertahankan agar snapshot\/commit tidak hilang/);
});

test('Stage 57 does not force-push, reset, rebase, amend or delete an interrupted branch', async () => {
  const launcher = await read('scripts/git-upload.sh');
  const recovery = await read('scripts/git-upload-recovery.mjs');
  const autoPush = await read('scripts/auto-push.sh');
  assert.doesNotMatch(launcher, /git push\s+--force|git reset\s+--hard|git rebase|git commit\s+--amend/);
  assert.doesNotMatch(launcher, /git branch\s+-D/);
  assert.match(launcher, /Branch upload dipertahankan agar snapshot\/commit tidak hilang/);
  assert.match(recovery, /tryRun\(\['cherry'/);
  assert.match(recovery, /RECOVERY_MUTATION=NONE/);
  assert.match(recovery, /PATCHES_ALREADY_IN_BASE/);
  assert.match(autoPush, /npm audit --json/);
  assert.match(autoPush, /FAIL_HIGH_OR_CRITICAL/);
  assert.match(autoPush, /NPM_AUDIT_RESULT=UNAVAILABLE/);
});

test('Stage 57 npm scripts, release metadata and docs are registered', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const lock = JSON.parse(await read('package-lock.json'));
  const readme = await read('README.md');
  const docs = await read('docs/STAGE-57-GIT-COMMIT-LINEAGE-RECOVERY.md');
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.match(pkg.scripts['verify:all'], /verify:stage57/);
  assert.match(readme, /Stage 57 — Git Commit Lineage/);
  assert.match(docs, /resume/);
});

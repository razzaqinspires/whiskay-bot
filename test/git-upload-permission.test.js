import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, mkdtemp, mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('git upload launcher is executable and its shell syntax is valid', async () => {
  const launcher = path.join(root, 'scripts', 'git-upload.sh');
  const info = await stat(launcher);
  if (process.platform !== 'win32') assert.ok((info.mode & 0o111) !== 0, 'git-upload.sh must retain an executable bit');
  const result = spawnSync('bash', ['-n', launcher], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const source = await readFile(launcher, 'utf8');
  assert.match(source, /BASH_SOURCE\[0\]/);
  assert.doesNotMatch(source, /cd \/root\/whiskay-bot/);
  assert.match(source, /scripts\/auto-push\.sh/);
  assert.match(source, /SOURCE_BRANCH.*BASE_BRANCH/);
  assert.ok(source.indexOf('QA_ARGS=') < source.indexOf('if ((DRY_RUN)); then'), 'dry-run must only be evaluated after the QA phase');
});

test('alias installer sets repo-local upload alias through bash', async () => {
  const installer = await readFile(path.join(root, 'scripts/install-git-upload-alias.sh'), 'utf8');
  const result = spawnSync('bash', ['-n', path.join(root, 'scripts/install-git-upload-alias.sh')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(installer, /chmod 755/);
  assert.match(installer, /scripts\/git-upload\.sh/);
  assert.match(installer, /alias\.upload/);
  assert.match(installer, /!bash/);
});

test('auto-push always performs a clean npm ci, then syntax and regression validation', async () => {
  const source = await readFile(path.join(root, 'scripts', 'auto-push.sh'), 'utf8');
  assert.match(source, /npm ci --no-audit --no-fund/);
  assert.match(source, /--prefer-offline/);
  assert.match(source, /EAI_AGAIN\|ENOTFOUND/);
  assert.match(source, /node --check/);
  assert.match(source, /npm test/);
  assert.doesNotMatch(source, /npm install/);
  const qa = source.slice(source.indexOf('--qa|qa)'));
  assert.ok(qa.indexOf('npm ci --no-audit --no-fund') < qa.indexOf('npm test'), 'npm ci must run before npm test in the QA phase');
});


test('git upload dry-run executes npm ci and full QA before stopping without commit or push', { skip: process.platform === 'win32' }, async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'whiskay-git-upload-dryrun-'));
  const repo = path.join(parent, 'repo');
  const remote = path.join(parent, 'remote.git');
  const mockBin = path.join(parent, 'mock-bin');
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await mkdir(repo, { recursive: true });
    await mkdir(mockBin, { recursive: true });
    await mkdir(path.join(repo, 'scripts'), { recursive: true });
    await mkdir(path.join(repo, '.github', 'workflows'), { recursive: true });
    await mkdir(path.join(repo, 'test'), { recursive: true });
    await execFileSync('git', ['init', '--bare', remote]);
    await execFileSync('git', ['init', '-b', 'main'], { cwd: repo });
    git('config', 'user.name', 'Whiskay Dry Run Test');
    git('config', 'user.email', 'dry-run@example.invalid');
    git('remote', 'add', 'origin', remote);

    for (const file of ['auto-push.sh', 'git-upload.sh', 'git-upload-intelligence.mjs', 'git-upload-recovery.mjs', 'git-upload-report.mjs', 'archive-test-log.mjs', 'protect-runtime-data.mjs', 'run-tests.mjs', 'testcommand-reporter.mjs', 'testcommand-runner.mjs']) {
      await cp(path.join(root, 'scripts', file), path.join(repo, 'scripts', file));
    }
    await writeFile(path.join(repo, '.github', 'workflows', 'ci.yml'), 'name: fixture\non: [push]\n');
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'dry-run-fixture', version: '1.0.0', type: 'module', scripts: { test: 'node scripts/run-tests.mjs' } }));
    await writeFile(path.join(repo, 'package-lock.json'), JSON.stringify({ name: 'dry-run-fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'dry-run-fixture', version: '1.0.0' } } }));
    await cp(path.join(root, '.gitignore'), path.join(repo, '.gitignore'));
    await writeFile(path.join(repo, '.env.example'), 'AI_SYSTEM_PROMPT=Safe test prompt\n');
    await writeFile(path.join(repo, 'README.md'), '# dry-run fixture\n');
    await writeFile(path.join(repo, 'test', 'sample.test.js'), "import test from 'node:test';\ntest('dry-run QA test', () => {});\n");
    await writeFile(path.join(mockBin, 'npm'), `#!/bin/sh\ncase "$1" in\n  ci)\n    mkdir -p node_modules\n    printf '{"lockfileVersion":3}' > node_modules/.package-lock.json\n    echo 'MOCK_NPM_CI=PASS'\n    exit 0\n    ;;\n  audit)
    printf '{"metadata":{"vulnerabilities":{"critical":0,"high":0,"moderate":0,"low":0,"info":0}}}\n'
    exit 0
    ;;\n  test) exec node scripts/run-tests.mjs ;;\nesac\necho "unexpected npm args: $*" >&2\nexit 2\n`, { mode: 0o755 });
    await execFileSync('chmod', ['755', path.join(mockBin, 'npm')]);

    git('add', '-A');
    git('commit', '-m', 'initial dry-run fixture');
    git('push', '-u', 'origin', 'main');
    const beforeHead = git('rev-parse', 'HEAD').trim();
    const env = { ...process.env, PATH: `${mockBin}${path.delimiter}${process.env.PATH || ''}` };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync('bash', ['scripts/git-upload.sh', '--dry-run'], { cwd: repo, env, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /MOCK_NPM_CI=PASS/);
    assert.match(result.stdout, /npm test/);
    assert.match(result.stdout, /Test: 1\/1 lulus/);
    assert.match(result.stdout, /DRY_RUN=PASS/);
    assert.match(result.stdout, /UPLOAD_REPORT_ZIP=data\/test-reports\//);
    assert.equal(git('rev-parse', 'HEAD').trim(), beforeHead, 'dry-run must not create a commit');
    assert.equal(execFileSync('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/main'], { encoding: 'utf8' }).trim(), beforeHead, 'dry-run must not push');
    assert.equal(git('status', '--porcelain').trim(), '', 'ignored npm/test runtime output must not invalidate the worktree');
    const reportName = result.stdout.match(/UPLOAD_REPORT_ZIP=(data\/test-reports\/\S+)/)?.[1];
    assert.ok(reportName);
    const report = await readFile(path.join(repo, reportName));
    assert.ok(report.length > 100);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('security hard-block creates local diagnostic ZIP without pushing a secret to GitHub', { skip: process.platform === 'win32' }, async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'whiskay-git-upload-blocked-'));
  const repo = path.join(parent, 'repo');
  const remote = path.join(parent, 'remote.git');
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await mkdir(path.join(repo, 'scripts'), { recursive: true });
    await mkdir(path.join(repo, '.github', 'workflows'), { recursive: true });
    await execFileSync('git', ['init', '--bare', remote]);
    await execFileSync('git', ['init', '-b', 'main'], { cwd: repo });
    git('config', 'user.name', 'Whiskay Security Test');
    git('config', 'user.email', 'security-test@example.invalid');
    git('remote', 'add', 'origin', remote);
    for (const file of ['auto-push.sh', 'git-upload.sh', 'git-upload-intelligence.mjs', 'git-upload-recovery.mjs', 'git-upload-report.mjs', 'protect-runtime-data.mjs', 'testcommand-runner.mjs']) {
      await cp(path.join(root, 'scripts', file), path.join(repo, 'scripts', file));
    }
    await cp(path.join(root, '.gitignore'), path.join(repo, '.gitignore'));
    await writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'blocked-fixture', version: '1.0.0', type: 'module' }));
    await writeFile(path.join(repo, 'package-lock.json'), JSON.stringify({ name: 'blocked-fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'blocked-fixture', version: '1.0.0' } } }));
    await writeFile(path.join(repo, 'README.md'), '# security fixture\n');
    await writeFile(path.join(repo, '.github', 'workflows', 'ci.yml'), 'name: fixture\n');
    git('add', '-A'); git('commit', '-m', 'initial'); git('push', '-u', 'origin', 'main');
    const mainBefore = git('rev-parse', 'HEAD').trim();
    await writeFile(path.join(repo, 'unsafe.txt'), `ghp_${'A'.repeat(36)}\n`);

    const result = spawnSync('bash', ['scripts/git-upload.sh'], { cwd: repo, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 8, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /UPLOAD BLOCKED/);
    assert.match(result.stdout, /UPLOAD_REPORT_ZIP|UPLOAD_REPORT_LOCAL/);
    const reports = await readFile(path.join(repo, 'data', 'test-reports', 'git-upload'), 'utf8').catch(() => null);
    assert.equal(reports, null, 'report output is stored as files, not a directory marker');
    const reportDir = path.join(repo, 'data', 'test-reports');
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(reportDir);
    assert.ok(files.some(file => file.endsWith('.zip')), 'local-only diagnostic ZIP must exist');
    assert.ok(files.some(file => file.endsWith('.md')), 'local-only diagnostic Markdown must exist');
    assert.equal(git('rev-parse', 'HEAD').trim(), mainBefore, 'hard-block must not create a commit');
    assert.equal(execFileSync('git', ['--git-dir', remote, 'rev-parse', 'refs/heads/main'], { encoding: 'utf8' }).trim(), mainBefore, 'hard-block must not push');
    const reportContent = await readFile(path.join(reportDir, files.find(file => file.endsWith('.md'))), 'utf8');
    assert.match(reportContent, /PRIVATE_DATA_GUARD_BLOCKED|PRIVATE_DATA_GUARD|SECURITY/);
    assert.doesNotMatch(reportContent, /ghp_A{20,}/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

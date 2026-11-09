import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

async function createFixture(prefix = 'whiskay-upload-') {
  const base = await mkdtemp(path.join(os.tmpdir(), prefix));
  const repo = path.join(base, 'repo');
  const remote = path.join(base, 'remote.git');
  await mkdir(repo, { recursive: true });
  execFileSync('git', ['init', '--bare', remote]);
  execFileSync('git', ['init', '-b', 'main'], { cwd: repo });
  git(repo, 'config', 'user.name', 'Whiskay Test');
  git(repo, 'config', 'user.email', 'whiskay-test@example.invalid');
  git(repo, 'remote', 'add', 'origin', remote);
  await writeFile(path.join(repo, 'README.md'), '# fixture\n');
  await writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'whiskay-fixture', version: '1.0.0', type: 'module', scripts: { test: 'node --test' } }));
  await mkdir(path.join(repo, 'assets', 'dungeon'), { recursive: true });
  await writeFile(path.join(repo, 'assets', 'dungeon', 'floors.json'), '[]\n');
  await mkdir(path.join(repo, 'docs', 'project'), { recursive: true });
  await writeFile(path.join(repo, 'docs', 'project', 'CHANGELOG.md'), '# Changelog\n');
  await cp(path.join(ROOT, '.gitignore'), path.join(repo, '.gitignore'));
  await writeFile(path.join(repo, '.env.example'), 'API_KEY=replace-me\n');
  await mkdir(path.join(repo, 'scripts'), { recursive: true });
  await mkdir(path.join(repo, '.github', 'workflows'), { recursive: true });
  await writeFile(path.join(repo, '.github', 'workflows', 'ci.yml'), 'name: test\n');
  await cp(path.join(ROOT, 'scripts', 'auto-push.sh'), path.join(repo, 'scripts', 'auto-push.sh'));
  await cp(path.join(ROOT, 'scripts', 'protect-runtime-data.mjs'), path.join(repo, 'scripts', 'protect-runtime-data.mjs'));
  await cp(path.join(ROOT, 'scripts', 'git-upload-intelligence.mjs'), path.join(repo, 'scripts', 'git-upload-intelligence.mjs'));
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'initial');
  git(repo, 'push', '-u', 'origin', 'main');
  return { base, repo, remote };
}

function analyze(repo) {
  const result = spawnSync('bash', ['scripts/auto-push.sh', '--analyze'], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const fingerprint = `${result.stdout}\n${result.stderr}`.match(/APPROVAL_FINGERPRINT=([a-f0-9]{64})/)?.[1];
  assert.ok(fingerprint, 'analysis must emit a SHA-256 approval fingerprint');
  return { result, fingerprint };
}

function publish(repo, fingerprint, branch) {
  git(repo, 'checkout', '-b', branch);
  const result = spawnSync('bash', ['scripts/auto-push.sh', '--publish', `--expected-fingerprint=${fingerprint}`], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PUSH_RESULT=SUCCESS/);
  assert.match(result.stdout, new RegExp(`UPLOAD_BRANCH=${branch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  return result;
}

test('auto-push publishes only upload/* and leaves origin/main unchanged', async () => {
  const { base, repo, remote } = await createFixture();
  try {
    await writeFile(path.join(repo, 'feature.txt'), 'reviewed change\n');
    const { fingerprint } = analyze(repo);
    const branch = 'upload/stage53-test';
    publish(repo, fingerprint, branch);
    const mainSha = git(remote, 'rev-parse', 'refs/heads/main').trim();
    const uploadSha = git(remote, 'rev-parse', `refs/heads/${branch}`).trim();
    assert.notEqual(uploadSha, mainSha);
    assert.equal(git(repo, 'rev-parse', 'origin/main').trim(), mainSha);
    assert.match(git(remote, 'show-ref', '--heads'), new RegExp(`refs/heads/${branch.replace('/', '\\/')}`));
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('auto-push sends already committed local changes on upload branch', async () => {
  const { base, repo, remote } = await createFixture('whiskay-upload-ahead-');
  try {
    git(repo, 'checkout', '-b', 'upload/ahead-test');
    await writeFile(path.join(repo, 'committed-before-upload.txt'), 'commit exists before approval\n');
    git(repo, 'add', '-A'); git(repo, 'commit', '-m', 'pre-existing local upload commit');
    const { fingerprint } = analyze(repo);
    const result = spawnSync('bash', ['scripts/auto-push.sh', '--publish', `--expected-fingerprint=${fingerprint}`], { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /PUSH_RESULT=SUCCESS/);
    assert.ok(git(remote, 'show-ref', '--heads').includes('refs/heads/upload/ahead-test'));
    assert.equal(git(repo, 'rev-list', '--count', 'origin/main..HEAD').trim(), '1');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('auto-push rejects stale approvals and never contains a direct main push', async () => {
  const { base, repo } = await createFixture('whiskay-upload-stale-');
  try {
    const { fingerprint } = analyze(repo);
    git(repo, 'checkout', '-b', 'upload/stale-test');
    await writeFile(path.join(repo, 'late-commit.txt'), 'not in the approved snapshot\n');
    git(repo, 'add', '-A'); git(repo, 'commit', '-m', 'late commit');
    const result = spawnSync('bash', ['scripts/auto-push.sh', '--publish', `--expected-fingerprint=${fingerprint}`], { cwd: repo, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Repository berubah/);
    const script = await readFile(path.join(ROOT, 'scripts', 'auto-push.sh'), 'utf8');
    assert.doesNotMatch(script, /git push\s+origin\s+main/);
    assert.doesNotMatch(script, /git reset --hard|git stash push|git pull --rebase/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('legacy tracked data, sessions and .env are removed from index but preserved locally', async () => {
  const { base, repo, remote } = await createFixture('whiskay-upload-private-');
  try {
    await mkdir(path.join(repo, 'data', 'jadibot', 'sessions'), { recursive: true });
    await mkdir(path.join(repo, 'sessions'), { recursive: true });
    await mkdir(path.join(repo, 'session'), { recursive: true });
    await mkdir(path.join(repo, '.wwebjs_auth', 'Default'), { recursive: true });
    await mkdir(path.join(repo, 'baileys_auth_info'), { recursive: true });
    await mkdir(path.join(repo, 'test', 'reports'), { recursive: true });
    await mkdir(path.join(repo, 'docs', 'reports'), { recursive: true });
    await mkdir(path.join(repo, 'nested', 'config'), { recursive: true });
    await writeFile(path.join(repo, 'data', 'leveling.json'), '{"users":{"private":true}}\n');
    await writeFile(path.join(repo, 'data', 'jadibot', 'sessions', 'auth.json'), '{"creds":"local"}\n');
    await writeFile(path.join(repo, 'sessions', 'creds.json'), '{"creds":"local"}\n');
    await writeFile(path.join(repo, 'session', 'auth.json'), '{"creds":"singular-local"}\n');
    await writeFile(path.join(repo, '.wwebjs_auth', 'Default', 'creds.json'), '{"creds":"web-session-local"}\n');
    await writeFile(path.join(repo, 'baileys_auth_info', 'creds.json'), '{"creds":"baileys-local"}\n');
    await writeFile(path.join(repo, 'cache.sqlite-wal'), 'private sqlite wal\n');
    await writeFile(path.join(repo, 'credentials.json'), '{"privateKey":"local"}\n');
    await writeFile(path.join(repo, 'test', 'reports', 'legacy.log'), 'old test log\n');
    await writeFile(path.join(repo, 'nested', 'config', '.env.example'), 'REAL_SECRET=private-local-value\n');
    await writeFile(path.join(repo, '.env'), 'WHATSAPP_SESSION=local-only\n');
    await writeFile(path.join(repo, 'assets-placeholder.txt'), 'source\n');
    git(repo, 'add', '-f', 'data/leveling.json', 'data/jadibot/sessions/auth.json', 'sessions/creds.json', 'session/auth.json', '.wwebjs_auth/Default/creds.json', 'baileys_auth_info/creds.json', 'cache.sqlite-wal', 'credentials.json', 'test/reports/legacy.log', 'nested/config/.env.example', '.env');
    git(repo, 'commit', '-m', 'legacy runtime data was tracked');
    await writeFile(path.join(repo, 'feature.txt'), 'safe source change\n');

    const { result, fingerprint } = analyze(repo);
    assert.match(result.stdout, /Mengeluarkan file private\/runtime dari Git index/);
    git(repo, 'checkout', '-b', 'upload/private-guard');
    const publishResult = spawnSync('bash', ['scripts/auto-push.sh', '--publish', `--expected-fingerprint=${fingerprint}`], { cwd: repo, encoding: 'utf8' });
    assert.equal(publishResult.status, 0, `${publishResult.stdout}\n${publishResult.stderr}`);

    assert.equal(await readFile(path.join(repo, 'data', 'leveling.json'), 'utf8'), '{"users":{"private":true}}\n');
    assert.equal(await readFile(path.join(repo, 'data', 'jadibot', 'sessions', 'auth.json'), 'utf8'), '{"creds":"local"}\n');
    assert.equal(await readFile(path.join(repo, 'sessions', 'creds.json'), 'utf8'), '{"creds":"local"}\n');
    assert.equal(await readFile(path.join(repo, 'session', 'auth.json'), 'utf8'), '{"creds":"singular-local"}\n');
    assert.equal(await readFile(path.join(repo, '.wwebjs_auth', 'Default', 'creds.json'), 'utf8'), '{"creds":"web-session-local"}\n');
    assert.equal(await readFile(path.join(repo, 'baileys_auth_info', 'creds.json'), 'utf8'), '{"creds":"baileys-local"}\n');
    assert.equal(await readFile(path.join(repo, 'cache.sqlite-wal'), 'utf8'), 'private sqlite wal\n');
    assert.equal(await readFile(path.join(repo, 'credentials.json'), 'utf8'), '{"privateKey":"local"}\n');
    assert.equal(await readFile(path.join(repo, 'test', 'reports', 'legacy.log'), 'utf8'), 'old test log\n');
    assert.equal(await readFile(path.join(repo, 'nested', 'config', '.env.example'), 'utf8'), 'REAL_SECRET=private-local-value\n');
    assert.equal(await readFile(path.join(repo, '.env'), 'utf8'), 'WHATSAPP_SESSION=local-only\n');

    const committed = git(remote, 'ls-tree', '-r', '--name-only', 'refs/heads/upload/private-guard');
    assert.doesNotMatch(committed, /(^|\/)data\//);
    assert.doesNotMatch(committed, /(^|\/)sessions\//);
    assert.doesNotMatch(committed, /(^|\/)session\//);
    assert.doesNotMatch(committed, /(^|\/)\.wwebjs_auth\//);
    assert.doesNotMatch(committed, /(^|\/)baileys_auth_info\//);
    assert.doesNotMatch(committed, /(^|\/)cache\.sqlite-wal$/m);
    assert.doesNotMatch(committed, /(^|\/)credentials\.json$/m);
    assert.doesNotMatch(committed, /(^|\/)\.env$/m);
    assert.doesNotMatch(committed, /(^|\/)test\/reports\//);
    assert.doesNotMatch(committed, /(^|\/)nested\/config\/\.env\.example$/m);
    assert.match(committed, /^\.env\.example$/m);
    assert.equal(git(repo, 'ls-files', 'data', 'sessions', 'session', '.wwebjs_auth', 'baileys_auth_info', 'cache.sqlite-wal', 'credentials.json', '.env', 'test/reports', 'nested/config/.env.example').trim(), '');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('upload launcher and GitHub automation use upload branches, artifacts and issue reporting', async () => {
  const launcher = await readFile(path.join(ROOT, 'scripts', 'git-upload.sh'), 'utf8');
  const prWorkflow = await readFile(path.join(ROOT, '.github', 'workflows', 'upload-branch-pr.yml'), 'utf8');
  const ciWorkflow = await readFile(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(launcher, /auto-push\.sh/);
  assert.match(launcher, /QA_ARGS=/);
  assert.match(launcher, /--tracked=true/);
  assert.match(launcher, /git switch -c/);
  assert.match(launcher, /--publish/);
  assert.match(prWorkflow, /branches:[\s\S]*upload\/\*\*/);
  assert.match(prWorkflow, /pulls\.create/);
  assert.match(prWorkflow, /issues\.create/);
  assert.match(prWorkflow, /upload-artifact@v4/);
  assert.match(ciWorkflow, /issues\.create/);
  assert.match(ciWorkflow, /npm ci/);
});

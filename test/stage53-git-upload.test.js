import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('Stage 53 ignores every data/session directory and private credential/database formats', async () => {
  const ignore = await read('.gitignore');
  for (const rule of ['/data/', '**/data/', '/sessions/', '**/sessions/', '/session/', '**/session/', '.wwebjs_auth/', '**/.wwebjs_auth/', 'baileys_auth_info/', '**/baileys_auth_info/', '.env', '.env.*', '*.db', '*.db-journal', '*.sqlite', '*.sqlite-wal', '*.sqlite-shm', '*.pem', '*.key', '*.secret', 'credentials.json', 'service-account*.json']) {
    assert.ok(ignore.includes(rule), `missing ignore rule: ${rule}`);
  }
  assert.match(ignore, /!\/\.env\.example/);
  assert.doesNotMatch(ignore, /!\/data\/|!.*data\/dungeon/);
});

test('all shareable dungeon definitions are outside the private data/ tree', async () => {
  const asset = await read('assets/dungeon/floors.json');
  assert.ok(asset.length > 0, 'canonical shareable dungeon definition must exist under assets/');
  // A local legacy copy may remain in ignored data/; never delete runtime data.
  // The invariant is that Git does not track that private path.
  let tracked = true;
  try { execFileSync('git', ['ls-files', '--error-unmatch', '--', 'data/dungeon/floors.json'], { cwd: root, stdio: 'ignore' }); }
  catch { tracked = false; }
  assert.equal(tracked, false, 'legacy runtime dungeon path must not be tracked by Git');
  const rpg = await read('src/plugins/games/rpg.js');
  assert.match(rpg, /assets\/dungeon\/floors\.json/);
});

test('runtime guard removes data, sessions, auth and credential files without deleting local data', async () => {
  const source = await read('scripts/protect-runtime-data.mjs');
  assert.match(source, /localOnlyDirectories = new Set/);
  assert.match(source, /'data', 'sessions', 'session'/);
  assert.match(source, /baileys_auth_info/);
  assert.match(source, /sqlite-wal/);
  assert.match(source, /credentials.*json/);
  const report = await read('scripts/git-upload-report.mjs');
  assert.match(report, /preflight\.log/);
  assert.match(report, /blocked-reason\.log/);
  assert.match(report, /qaStatus === 'BLOCKED'/);
  assert.match(source, /localOnlyDirectories/);
  assert.match(source, /normalized !== '\.env\.example'/);
  assert.match(source, /git', \['rm', '--cached', '-f'/);
  assert.match(source, /TIDAK dihapus/);
});

test('upload launcher runs full QA but submits failed diagnostics on a review branch', async () => {
  const launcher = await read('scripts/git-upload.sh');
  const autoPush = await read('scripts/auto-push.sh');
  assert.match(launcher, /auto-push\.sh/);
  assert.match(launcher, /QA_ARGS=/);
  assert.match(autoPush, /npm ci/);
  assert.match(launcher, /QA gagal[\s\S]*Upload branch tetap dapat diteruskan/);
  assert.match(launcher, /SYNC_RESULT=CONFLICT[\s\S]*UPLOAD HALTED[\s\S]*exit 9/);
  assert.match(launcher, /write_local_blocked_report/);
  assert.match(launcher, /git switch -c/);
  assert.match(launcher, /auto-push\.sh --snapshot[\s\S]*Merge origin/);
  assert.match(autoPush, /--snapshot/);
  assert.match(launcher, /SOURCE_BRANCH[\s\S]*BASE_BRANCH/);
  assert.match(launcher, /--publish/);
  assert.match(launcher, /write_local_blocked_report/);
  assert.match(launcher, /--qa-status=BLOCKED/);
  assert.match(autoPush, /BRANCH" == upload\/\*/);
  assert.match(autoPush, /%A %Y-%m-%d %H:%M:%S WIB/);
  assert.doesNotMatch(autoPush, /git push\s+origin\s+main/);
});

test('GitHub Actions creates PR, archives logs and opens detailed issues on failures', async () => {
  const workflow = await read('.github/workflows/upload-branch-pr.yml');
  const ci = await read('.github/workflows/ci.yml');
  assert.match(workflow, /upload\/\*\*/);
  assert.match(workflow, /github\.rest\.pulls\.create/);
  assert.match(workflow, /Pull Request creation failed/);
  assert.match(workflow, /continuing diagnostics/);
  assert.match(workflow, /github\.rest\.issues\.create/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(ci, /actions\/upload-artifact@v4/);
  assert.match(ci, /github\.rest\.issues\.create/);
});

test('Stage 53 documentation records the new private-data and branch-only policy', async () => {
  const readme = await read('README.md');
  const docs = await read('docs/STAGE-53-GITHUB-SAFE-UPLOAD.md');
  const pkg = JSON.parse(await read('package.json'));
  const lock = JSON.parse(await read('package-lock.json'));
  assert.match(pkg.version, /^2\.35\.\d+$/);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.match(readme, /Stage 53 — GitHub-Safe Upload/);
  assert.match(docs, /upload\/\*/);
  assert.match(docs, /sessions/);
  assert.match(pkg.scripts['verify:all'], /verify:stage53/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const readText = (relativePath) => readFile(path.join(projectRoot, relativePath), 'utf8');

async function listFilesRecursively(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await listFilesRecursively(absolutePath));
    else if (entry.isFile()) found.push(path.relative(projectRoot, absolutePath));
  }
  return found;
}

test('root contains only canonical regular files and README is the only root Markdown file', async () => {
  const entries = await readdir(projectRoot, { withFileTypes: true });
  const regularFiles = entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
  const rootMarkdown = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(regularFiles, ['LICENSE', 'README.md', 'package-lock.json', 'package.json']);
  assert.deepEqual(rootMarkdown, ['README.md']);
});

test('project documentation and third-party notice are stored outside the root', async () => {
  for (const relativePath of [
    'docs/project/CHANGELOG.md',
    'docs/project/MEMORY.md',
    'docs/legal/NOTICE-THIRD-PARTY.md',
    'docs/STAGE-52-REPOSITORY-STRUCTURE-CLEANUP.md',
    'docs/TEST-REPORT-STAGE-52-REPOSITORY-STRUCTURE.md',
  ]) {
    assert.ok((await stat(path.join(projectRoot, relativePath))).isFile(), `${relativePath} must exist`);
  }
});

test('scripts and PM2 configuration resolve from their canonical locations', async () => {
  const pkg = JSON.parse(await readText('package.json'));
  assert.equal(pkg.scripts.pair, 'node scripts/pair.mjs');
  assert.equal(pkg.scripts['start:pm2'], 'pm2 start config/ecosystem.config.cjs');
  assert.equal(pkg.scripts['restart:pm2'], 'pm2 restart config/ecosystem.config.cjs');
  assert.equal(pkg.scripts['stop:pm2'], 'pm2 stop config/ecosystem.config.cjs');
  assert.equal(pkg.scripts['verify:stage52'], 'node --test test/stage52-repository-structure.test.js');
  assert.ok(pkg.scripts['verify:all'].includes('npm run verify:stage52'));
  assert.ok((await stat(path.join(projectRoot, 'scripts/pair.mjs'))).isFile());

  const pm2Config = require(path.join(projectRoot, 'config/ecosystem.config.cjs'));
  assert.equal(pm2Config.apps[0].name, 'whiskay-bot');
  assert.equal(pm2Config.apps[0].cwd, projectRoot);
  assert.equal(pm2Config.apps[0].script, path.join(projectRoot, 'scripts/start.mjs'));
});

test('only .github contains active workflows; legacy mirror and patch are archived', async () => {
  const pkg = JSON.parse(await readText('package.json'));
  assert.ok((await stat(path.join(projectRoot, '.github/workflows/ci.yml'))).isFile());
  assert.ok((await stat(path.join(projectRoot, 'docs/archive/legacy-github/github/workflows/ci.yml'))).isFile());
  assert.ok((await stat(path.join(projectRoot, 'docs/archive/patches/whiskay-local-fix-1.patch'))).isFile());
  await assert.rejects(stat(path.join(projectRoot, 'github')));
  assert.equal(pkg.scripts['verify:stage52'].startsWith('node --test'), true);
});

test('obsolete duplicates and unreferenced source backups are removed', async () => {
  for (const relativePath of ['env.example', 'gitignore', 'pair.js', 'ecosystem.config.cjs']) {
    await assert.rejects(stat(path.join(projectRoot, relativePath)), `${relativePath} should not remain in root`);
  }

  const sourceFiles = await listFilesRecursively(path.join(projectRoot, 'src'));
  const backupFiles = sourceFiles.filter((file) => /\.pre-[^/]+$|\.(?:bak|old|orig)$|\.patch$/i.test(file));
  assert.deepEqual(backupFiles, []);

  try {
    const reports = await readdir(path.join(projectRoot, 'data/test-reports'));
    assert.ok(reports.every((name) => name === 'README.txt'), 'generated QA outputs must not be retained');
  } catch (error) {
    assert.equal(error.code, 'ENOENT', 'only an absent test-report runtime directory is acceptable');
  }
});

test('documentation, package metadata and Git upload pipeline point to the new paths', async () => {
  const [readme, changelog, gitUpload, docsIndex] = await Promise.all([
    readText('README.md'),
    readText('docs/project/CHANGELOG.md'),
    readText('scripts/auto-push.sh'),
    readText('docs/README.md'),
  ]);
  const pkg = JSON.parse(await readText('package.json'));
  const lock = JSON.parse(await readText('package-lock.json'));

  assert.match(pkg.version, /^2\.35\.\d+$/);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.match(readme, /docs\/project\/MEMORY\.md/);
  assert.match(readme, /Stage 52 — Repository Structure Cleanup/);
  assert.match(changelog, /2\.35\.15 — Stage 52/);
  assert.match(gitUpload, /BASE_BRANCH/);
  assert.match(gitUpload, /upload\/\*/);
  assert.match(gitUpload, /assets\/dungeon\/floors\.json/);
  assert.match(docsIndex, /project\/CHANGELOG\.md/);
  assert.match(docsIndex, /STAGE-52-REPOSITORY-STRUCTURE-CLEANUP\.md/);
});

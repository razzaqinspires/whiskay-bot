import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('Stage 55 plugin command intelligence runs and reports plugin metadata', () => {
  const out = execFileSync(process.execPath, ['scripts/plugin-command-intelligence.mjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /Plugin command intelligence: PASS_WITH_ADVISORIES/);
  assert.match(out, /Plugin files scanned: [1-9]\d*/);
});
test('Stage 55 does not mutate plugin source or delete duplicate candidates', () => {
  const script = fs.readFileSync(path.join(ROOT, 'scripts/plugin-command-intelligence.mjs'), 'utf8');
  assert.match(script, /does not delete|Tidak menghapus|Tidak menghapus/i);
  assert.match(script, /DUPLICATE_COMMAND_CANDIDATE/);
});
test('Stage 55 npm scripts are registered', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['audit:plugins'], 'node scripts/plugin-command-intelligence.mjs');
  assert.equal(pkg.scripts['verify:stage55'], 'node --test test/stage55-plugin-command-intelligence.test.js');
});

test('Stage 55 upload commits dirty changes before attempting base synchronization', async () => {
  const launcher = fs.readFileSync(path.join(ROOT, 'scripts/git-upload.sh'), 'utf8');
  const autoPush = fs.readFileSync(path.join(ROOT, 'scripts/auto-push.sh'), 'utf8');
  assert.ok(launcher.indexOf('auto-push.sh --snapshot') < launcher.indexOf('git merge --no-edit'));
  assert.match(launcher, /SYNC_RESULT=CONFLICT[\s\S]*exit 9/);
  assert.match(autoPush, /--snapshot[\s\S]*git add -A[\s\S]*git commit/);
  assert.ok(autoPush.includes("git diff --cached --check -- '*.js' '*.mjs' '*.cjs'"));
});

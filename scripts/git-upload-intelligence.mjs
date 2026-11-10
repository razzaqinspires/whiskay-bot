#!/usr/bin/env node
/** Stage 56: understand Git history, staged moves and duplicate legacy script paths. */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mode = process.argv[2] || '--analyze';
const run = (args, options = {}) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
const tryRun = args => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); return r.status === 0 ? r.stdout : ''; };
const exists = p => existsSync(path.join(root, p));
const norm = s => s.replace(/\r/g, '').split('\n').map(x => x.trim()).filter(Boolean);
function similarity(a, b) {
  if (a === b) return 1;
  const aa = norm(a), bb = norm(b);
  if (!aa.length || !bb.length) return 0;
  const A = new Set(aa), B = new Set(bb);
  let common = 0; for (const x of A) if (B.has(x)) common++;
  return (2 * common) / (A.size + B.size);
}
function contentAt(p) {
  if (exists(p)) return readFileSync(path.join(root, p), 'utf8');
  // A path may be staged (A) and then removed/moved in the worktree (D):
  // inspect the index blob before falling back to the committed HEAD version.
  const indexed = tryRun(['show', `:${p}`]);
  if (indexed) return indexed;
  return tryRun(['show', `HEAD:${p}`]);
}
function trackedPaths() { return tryRun(['ls-files', '-z']).split('\0').filter(Boolean); }
function indexPaths() { return tryRun(['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean); }
function reportHistory() {
  const base = process.env.WHISKAY_GITHUB_BASE_BRANCH || 'main';
  const upstream = `origin/${base}`;
  const hasUpstream = tryRun(['rev-parse', '--verify', upstream]).trim();
  const range = hasUpstream ? `${upstream}..HEAD` : 'HEAD~5..HEAD';
  const history = tryRun(['log', '--format=%h %s', '--name-status', '--find-renames', range]);
  console.log(`HISTORY_RANGE=${hasUpstream ? range : 'recent-local-commits (fallback)'}`);
  if (!history.trim()) console.log('HISTORY_PENDING=NONE');
  else { console.log('--- Commit history / path transitions ---'); console.log(history.trim()); }
  const staged = tryRun(['diff', '--cached', '--name-status', '--find-renames', '-M']);
  const unstaged = tryRun(['diff', '--name-status', '--find-renames', '-M']);
  console.log('--- Staged rename/deletion analysis ---'); console.log(staged.trim() || 'No staged changes');
  console.log('--- Unstaged rename/deletion analysis ---'); console.log(unstaged.trim() || 'No unstaged tracked changes');
}
function reconcile() {
  const candidates = trackedPaths().filter(p => !p.includes('/') && p.endsWith('.sh'));
  const decisions = [];
  for (const oldPath of candidates) {
    const newPath = `scripts/${path.basename(oldPath)}`;
    if (!exists(newPath)) continue;
    const oldText = contentAt(oldPath);
    const newText = contentAt(newPath);
    const score = similarity(oldText, newText);
    if (score >= 0.65) {
      // The scripts/ copy is canonical. Remove only the duplicate legacy root entry.
      const inIndex = spawnSync('git', ['ls-files', '--error-unmatch', '--', oldPath], { cwd: root, stdio: 'ignore' }).status === 0;
      if (inIndex) run(['rm', '--cached', '-f', '--', oldPath]);
      if (exists(oldPath)) unlinkSync(path.join(root, oldPath));
      decisions.push({ oldPath, newPath, score: Number(score.toFixed(3)), action: 'REMOVED_DUPLICATE_ROOT_COPY' });
    } else {
      decisions.push({ oldPath, newPath, score: Number(score.toFixed(3)), action: 'REVIEW_REQUIRED_NO_DELETE' });
    }
  }
  console.log('--- Canonical path reconciliation ---');
  if (!decisions.length) console.log('No root/scripts duplicate candidates.');
  for (const d of decisions) console.log(`${d.action} | ${d.oldPath} -> ${d.newPath} | similarity=${d.score}`);
  if (decisions.some(d => d.action === 'REVIEW_REQUIRED_NO_DELETE')) {
    console.error('RECONCILIATION_REVIEW_REQUIRED=1'); process.exitCode = 12;
  }
}
if (mode === '--analyze') { reportHistory(); reconcile(); }
else if (mode === '--reconcile') reconcile();
else if (mode === '--verify') {
  const files = trackedPaths();
  const duplicates = files.filter(p => !p.includes('/') && p.endsWith('.sh')).filter(p => exists(`scripts/${path.basename(p)}`));
  console.log(`ROOT_SCRIPT_DUPLICATE_COUNT=${duplicates.length}`);
  for (const p of duplicates) console.log(`DUPLICATE_CANDIDATE=${p}|scripts/${path.basename(p)}`);
  if (duplicates.length) process.exitCode = 12;
} else { console.error('Usage: node scripts/git-upload-intelligence.mjs --analyze|--reconcile|--verify'); process.exitCode = 64; }

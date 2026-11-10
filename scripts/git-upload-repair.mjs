#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED_EXT = new Set(['.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.sh', '.py']);
const PRIVATE_SEGMENTS = new Set(['data','sessions','session','node_modules','.runtime','.cache','coverage','logs','tmp','temp','downloads','test-reports']);
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore','pipe','pipe'], ...options });
}
export function isRepairablePath(relative) {
  if (!relative || path.isAbsolute(relative) || relative.includes('\0')) return false;
  const normalized = relative.replaceAll('\\','/');
  const parts = normalized.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || PRIVATE_SEGMENTS.has(part.toLowerCase()))) return false;
  if (normalized.startsWith('src/lib/external/')) return false;
  if (normalized === '.env.example' || normalized.startsWith('.github/workflows/')) return ALLOWED_EXT.has(path.extname(normalized));
  if (normalized.startsWith('src/') || normalized.startsWith('scripts/') || normalized.startsWith('test/') || normalized.startsWith('config/') || normalized.startsWith('.github/')) {
    return ALLOWED_EXT.has(path.extname(normalized));
  }
  return false;
}
export function stripTrailingWhitespace(source) {
  return source.split(/(\r\n|\n|\r)/).map((part, index) => index % 2 === 0 ? part.replace(/[ \t]+$/g, '') : part).join('');
}
async function stagedPaths() {
  return git(['diff','--cached','--name-only','--diff-filter=ACMRT','-z']).split('\0').filter(Boolean);
}
async function main() {
  const mode = process.argv[2] || '--staged';
  if (mode !== '--staged') throw new Error('Usage: node scripts/git-upload-repair.mjs --staged');
  const files = await stagedPaths();
  const runId = process.env.WHISKAY_UPLOAD_RUN_ID || new Date().toISOString().replace(/[:.]/g,'-');
  const backupRoot = path.join(ROOT,'data','test-reports','git-upload-repair',runId,'deterministic');
  let changed = 0;
  const skipped = [];
  for (const relative of files) {
    if (!isRepairablePath(relative)) { skipped.push(relative); continue; }
    const absolute = path.resolve(ROOT, relative);
    if (!absolute.startsWith(ROOT + path.sep)) { skipped.push(relative); continue; }
    let info;
    try { info = await stat(absolute); } catch { continue; }
    if (!info.isFile() || info.size > MAX_FILE_BYTES) { skipped.push(relative); continue; }
    const original = await readFile(absolute);
    const text = original.toString('utf8');
    if (text.includes('\uFFFD')) { skipped.push(relative); continue; }
    const fixed = stripTrailingWhitespace(text);
    if (fixed === text) continue;
    const backup = path.join(backupRoot, relative);
    await mkdir(path.dirname(backup), { recursive: true, mode: 0o700 });
    await writeFile(backup, original, { mode: 0o600 });
    await writeFile(absolute, fixed, { mode: info.mode & 0o777 });
    git(['add','--',relative]);
    changed++;
    console.log(`AUTO_REPAIRED_TRAILING_WHITESPACE ${relative} backup=${path.relative(ROOT,backup)}`);
  }
  console.log(`DETERMINISTIC_REPAIR changed=${changed} skipped=${skipped.length}`);
  if (skipped.length) console.log(`SKIPPED_PATHS=${skipped.join(',')}`);
  const check = await import('node:child_process').then(({spawnSync}) => spawnSync('git',['diff','--cached','--check','--','*.js','*.mjs','*.cjs','*.json','*.yml','*.yaml','*.sh','*.py',':(exclude)src/lib/external/**'],{cwd:ROOT,encoding:'utf8'}));
  if (check.status !== 0) {
    console.error((check.stdout || '') + (check.stderr || ''));
    process.exitCode = 2;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`GIT_UPLOAD_REPAIR_ERROR: ${error.message}`); process.exitCode = 1; });
}

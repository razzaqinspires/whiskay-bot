#!/usr/bin/env node
/** Stage 54: deterministic repository integrity audit (no network, no writes by default). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIRS = ['src', 'scripts', 'test', 'config', 'automation', '.github/scripts'];
const EXTENSIONS = ['.js', '.mjs', '.cjs', '.json'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'data', 'sessions', 'session', 'coverage', '.next', 'dist', 'build']);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}
function resolveLocal(from, specifier) {
  if (!specifier.startsWith('.')) return null;
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  const base = path.resolve(path.dirname(from), cleanSpecifier);
  const candidates = [base, ...EXTENSIONS.map(ext => `${base}${ext}`), ...['index.js','index.mjs','index.cjs','index.json'].map(name => path.join(base,name))];
  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

const files = SOURCE_DIRS.flatMap(dir => walk(path.join(ROOT, dir))).sort();
const missing = [];
const imports = [];
const importPattern = /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()(['"])(\.[^'"\n]+)\1/g;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[2];
    const target = resolveLocal(file, specifier);
    imports.push({ file: path.relative(ROOT,file), specifier });
    // Optional require() calls guarded by try/catch are feature probes, not broken imports.
    const prefix = source.slice(Math.max(0, match.index - 180), match.index);
    const optionalRequire = match[0].includes('require') && /try\s*\{[\s\S]*$/.test(prefix);
    if (!target && !optionalRequire) missing.push({ file: path.relative(ROOT,file), specifier, line: source.slice(0, match.index).split('\n').length });
  }
}

let packageLock = { status: 'MISSING' };
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT,'package-lock.json'),'utf8'));
  const lockPkg = lock.packages?.[''];
  const mismatches = [];
  if (lock.name !== pkg.name) mismatches.push(`name: package=${pkg.name}, lock=${lock.name}`);
  if (lock.version !== pkg.version) mismatches.push(`version: package=${pkg.version}, lock=${lock.version}`);
  if (lockPkg?.version !== pkg.version) mismatches.push(`packages[""].version: package=${pkg.version}, lock=${lockPkg?.version}`);
  packageLock = { status: mismatches.length ? 'FAIL' : 'PASS', mismatches };
} catch (error) { packageLock = { status: 'FAIL', error: error.message }; }

const result = {
  stage: 54,
  generatedAt: new Date().toISOString(),
  filesScanned: files.length,
  localImportsChecked: imports.length,
  missingLocalImports: missing,
  packageLock,
  status: missing.length || packageLock.status !== 'PASS' ? 'FAIL' : 'PASS',
};
const outputArg = process.argv.find(arg => arg.startsWith('--output='));
const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (outputArg) fs.writeFileSync(path.resolve(ROOT, outputArg.slice('--output='.length)), serialized);
console.log(`Repository integrity: ${result.status}`);
console.log(`Source files scanned: ${result.filesScanned}`);
console.log(`Relative imports checked: ${result.localImportsChecked}`);
console.log(`Missing relative imports: ${missing.length}`);
console.log(`package-lock consistency: ${packageLock.status}`);
if (missing.length) for (const item of missing) console.log(`MISSING ${item.file}:${item.line} -> ${item.specifier}`);
if (packageLock.mismatches?.length) for (const item of packageLock.mismatches) console.log(`LOCK ${item}`);
if (result.status !== 'PASS') process.exitCode = 1;

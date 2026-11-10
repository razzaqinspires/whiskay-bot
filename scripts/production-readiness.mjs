#!/usr/bin/env node
import { access, constants, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile, rename, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_FILES = ['package.json', 'package-lock.json', 'src/core/Bot.js', 'src/core/SourceWatcher.js', 'scripts/start.mjs'];
const REQUIRED_RUNTIME_DEPS = ['@whiskeysockets/baileys', 'pino', 'dotenv', 'chokidar'];
const SENSITIVE_NAMES = new Set(['.env', '.env.production', '.env.local', 'creds.json']);

export function packageVersionCheck(manifest, lock) {
  const manifestVersion = manifest?.version;
  const lockVersion = lock?.packages?.['']?.version || lock?.version;
  return { ok: Boolean(manifestVersion && lockVersion && manifestVersion === lockVersion), manifestVersion, lockVersion };
}

export async function inspectDependencies(root = ROOT, names = REQUIRED_RUNTIME_DEPS) {
  const missing = [];
  const malformed = [];
  for (const name of names) {
    const packagePath = path.join(root, 'node_modules', ...name.split('/'), 'package.json');
    try {
      const parsed = JSON.parse(await readFile(packagePath, 'utf8'));
      if (!parsed.name) malformed.push(name);
    } catch { missing.push(name); }
  }
  return { ok: missing.length === 0 && malformed.length === 0, missing, malformed };
}

export async function validateDeployment(root = ROOT) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
  for (const relative of REQUIRED_FILES) {
    try { const info = await stat(path.join(root, relative)); add(`required:${relative}`, info.isFile(), info.isFile() ? 'file present' : 'not a regular file'); }
    catch { add(`required:${relative}`, false, 'missing'); }
  }
  let manifest, lock;
  try { manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')); add('package-json', true, `${manifest.name}@${manifest.version}`); }
  catch { add('package-json', false, 'invalid or unreadable'); }
  try { lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8')); add('package-lock-json', true, `lockfileVersion ${lock.lockfileVersion}`); }
  catch { add('package-lock-json', false, 'invalid or unreadable'); }
  if (manifest && lock) {
    const version = packageVersionCheck(manifest, lock);
    add('package-version-sync', version.ok, `${version.manifestVersion} / ${version.lockVersion}`);
    const direct = Object.keys(manifest.dependencies || {});
    const lockDirect = Object.keys(lock.packages?.['']?.dependencies || {});
    const same = direct.length === lockDirect.length && direct.every(name => lock.packages[''].dependencies[name] === manifest.dependencies[name]);
    add('dependency-lock-sync', same, `${direct.length} direct dependencies`);
  }
  const deps = await inspectDependencies(root);
  add('runtime-dependencies', deps.ok, deps.ok ? 'required runtime dependencies present' : `missing: ${deps.missing.join(', ')}`);
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const secretFiles = entries.filter(entry => entry.isFile() && SENSITIVE_NAMES.has(entry.name)).map(entry => entry.name);
    add('root-secret-files', secretFiles.length === 0, secretFiles.length ? `review local secret files: ${secretFiles.join(', ')}` : 'no root-level secret files');
  } catch { add('root-readable', false, 'cannot list project root'); }
  return { ok: checks.every(item => item.ok), checks };
}

export async function healthSnapshot(root = ROOT) {
  const deps = await inspectDependencies(root);
  const disk = await statfsSafe(root);
  const checks = {
    node: { ok: Number(process.versions.node.split('.')[0]) >= 20, version: process.versions.node, required: '>=20' },
    dependencies: deps,
    filesystem: disk,
    memory: { rssBytes: process.memoryUsage().rss, heapUsedBytes: process.memoryUsage().heapUsed, heapTotalBytes: process.memoryUsage().heapTotal },
    uptimeSeconds: Math.round(process.uptime()),
    pid: process.pid,
    platform: `${process.platform}/${process.arch}`,
  };
  return { status: Object.values(checks).every(value => value?.ok !== false), timestamp: new Date().toISOString(), checks };
}

async function statfsSafe(root) {
  try {
    const { statfs } = await import('node:fs/promises');
    const value = await statfs(root);
    const availableBytes = Number(value.bavail) * Number(value.bsize);
    return { ok: availableBytes > 128 * 1024 * 1024, availableBytes, minimumBytes: 128 * 1024 * 1024 };
  } catch (error) { return { ok: false, error: error.code || error.message }; }
}

export async function simulateRecovery() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-recovery-'));
  try {
    const primary = path.join(dir, 'state.json');
    const backup = `${primary}.bak`;
    const expected = JSON.stringify({ schemaVersion: 1, sequence: 7, marker: 'verified-backup' });
    await writeFile(primary, expected, { mode: 0o600 });
    await copyFile(primary, backup);
    await writeFile(primary, '{"corrupt":', { mode: 0o600 });
    let recovered = false;
    try { JSON.parse(await readFile(primary, 'utf8')); }
    catch {
      const backupValue = JSON.parse(await readFile(backup, 'utf8'));
      if (backupValue.marker !== 'verified-backup') throw new Error('Recovery backup marker mismatch');
      const temp = `${primary}.restore`;
      await writeFile(temp, JSON.stringify(backupValue), { mode: 0o600 });
      await rename(temp, primary);
      recovered = JSON.parse(await readFile(primary, 'utf8')).marker === 'verified-backup';
    }
    return { ok: recovered, scenario: 'corrupt-primary-restored-from-verified-backup' };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--health')) {
    const result = await healthSnapshot();
    console.log(JSON.stringify(result, null, 2));
    if (!result.status) process.exitCode = 1;
    return;
  }
  if (args.has('--recovery')) {
    const result = await simulateRecovery();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const result = await validateDeployment();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

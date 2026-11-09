#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, writeFileSync, unlinkSync, readlinkSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
// Reconcile .env against the authoritative .env.example before importing modules
// that snapshot ports/path defaults. Existing values are preserved; missing keys
// are appended; keys removed from the template are pruned only when previously managed.
const dotenvModule = await import('dotenv');
const dotenv = dotenvModule.default || dotenvModule;
const selectedEnvFile = process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : path.join(ROOT, '.env');
dotenv.config({ path: selectedEnvFile });
const { synchronizeEnvTemplate } = await import('../src/config/EnvTemplateSynchronizer.js');
const envSync = await synchronizeEnvTemplate();
if (envSync.addedKeys.length || envSync.removedKeys.length) {
  console.log(`[env-sync] added=${envSync.addedKeys.length} removed=${envSync.removedKeys.length} preserved=${envSync.preservedKeys.length}`);
}
dotenv.config({ path: selectedEnvFile });

function acquireSingleInstanceLock() {
  const lockPath = path.join(ROOT, '.runtime', 'whiskay-bot.pid');
  mkdirSync(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockPath, 'wx', 0o600);
      writeFileSync(fd, JSON.stringify({ pid: process.pid, root: ROOT, startedAt: new Date().toISOString() }) + '\n');
      process.on('exit', () => {
        try {
          const current = JSON.parse(readFileSync(lockPath, 'utf8'));
          if (Number(current.pid) === process.pid) unlinkSync(lockPath);
        } catch {}
      });
      return { ok: true, lockPath };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let current = null;
      try { current = JSON.parse(readFileSync(lockPath, 'utf8')); } catch {}
      if (!current) {
        try { if (Date.now() - statSync(lockPath).mtimeMs < 20000) return { ok: false, pid: 0, lockPath }; } catch {}
      }
      const pid = Number(current?.pid || 0);
      let active = false;
      if (pid > 0) {
        try {
          process.kill(pid, 0);
          let sameProject = false;
          try { sameProject = readlinkSync(`/proc/${pid}/cwd`) === ROOT && readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('start.mjs'); }
          catch { sameProject = true; }
          active = sameProject;
        } catch (probeError) { active = probeError.code === 'EPERM'; }
      }
      if (active) return { ok: false, pid, lockPath };
      try { unlinkSync(lockPath); } catch {}
    }
  }
  return { ok: false, pid: 0, lockPath };
}

function run(label, command, args = []) {
  process.stdout.write(`\n$ ${[command, ...args].join(' ')}\n`);
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', timeout: 5000, env: process.env });
  if (result.stdout) process.stdout.write(result.stdout.trimEnd() + '\n');
  if (result.stderr) process.stdout.write(result.stderr.trimEnd() + '\n');
  if (result.error) process.stdout.write(`(${result.error.code || result.error.message})\n`);
  if (result.status !== 0 && result.status !== null) process.stdout.write(`(${label}: exit ${result.status})\n`);
  return result;
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║              WHISKAY BOT · STARTUP PREFLIGHT               ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
run('architecture', 'uname', ['-m']);
const systemCloudflared = run('cloudflared path', 'which', ['cloudflared']);
for (const relative of ['bin/cloudflared-linux-arm64', 'data/bin/cloudflared-linux-arm64']) {
  try {
    const { statSync } = await import('node:fs');
    const stat = statSync(path.join(ROOT, relative));
    console.log(`[cloudflared] bundled ${relative}: ${stat.size} bytes`);
  } catch { console.log(`[cloudflared] bundled ${relative}: not installed (optional)`); }
}
if (systemCloudflared.status === 0 && systemCloudflared.stdout?.trim()) {
  const systemPath = systemCloudflared.stdout.trim().split(/\r?\n/)[0];
  const version = run('cloudflared version', systemPath, ['--version']);
  console.log(`[cloudflared] system binary ${version.status === 0 ? 'READY' : 'NOT RUNNABLE'}: ${systemPath}`);
}
run('node runtime', process.execPath, ['--version']);
run('npm runtime', 'npm', ['--version']);

try {
  const { resolveCloudflaredExecutable } = await import('../src/services/worldBossTunnel.js');
  const executable = resolveCloudflaredExecutable();
  console.log(`\n[cloudflared] executable siap: ${executable}`);
} catch (error) {
  console.warn(`\n[cloudflared] belum siap: ${error.message}`);
  console.warn('[cloudflared] Bot tetap akan start; tunnel worker akan retry otomatis di background.');
}

if (process.argv.includes('--diagnostics-only')) process.exit(0);
function findLegacyBotProcess() {
  try {
    for (const entry of readdirSync('/proc', { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
      const pid = Number(entry.name);
      if (pid === process.pid) continue;
      try {
        if (readlinkSync(`/proc/${pid}/cwd`) !== ROOT) continue;
        const argv = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
        if (!argv.length || !/^node(?:js)?$/.test(path.basename(argv[0]))) continue;
        if (argv.slice(1).some(arg => arg === 'src/index.js' || arg.endsWith('/src/index.js'))) return pid;
      } catch {}
    }
  } catch {}
  return null;
}
const legacyPid = findLegacyBotProcess();
if (legacyPid) {
  console.error(`\n[guard] Instance lama ditemukan (PID ${legacyPid}) berjalan langsung dari src/index.js. Hentikan instance tersebut sebelum memakai daemon npm start.`);
  process.exit(73);
}
const lock = acquireSingleInstanceLock();
if (!lock.ok) {
  console.error(`\n[guard] Instance Whiskay Bot sudah berjalan${lock.pid ? ` (PID ${lock.pid})` : ''}. Startup kedua dibatalkan untuk mencegah server/socket ganda.`);
  process.exit(73);
}
console.log('\n[startup] Single-instance lock acquired. Memulai satu Whiskay Bot process...\n');
await import(pathToFileURL(path.join(ROOT, 'src/index.js')).href);

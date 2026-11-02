#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, unlinkSync, readlinkSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME = path.join(ROOT, '.runtime');
const PID_FILE = path.join(RUNTIME, 'whiskay-bot.pid');
const LAUNCH_FILE = path.join(RUNTIME, 'whiskay-bot.launch.lock');
const LOG_DIR = path.join(RUNTIME, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'whiskay-bot.log');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function runPreflight(label, command, args = []) {
  process.stdout.write(`\n$ ${[command, ...args].join(' ')}\n`);
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', timeout: 5000, env: process.env });
  if (result.stdout) process.stdout.write(result.stdout.trimEnd() + '\n');
  if (result.stderr) process.stdout.write(result.stderr.trimEnd() + '\n');
  if (result.error) process.stdout.write(`(${result.error.code || result.error.message})\n`);
  if (result.status !== 0 && result.status !== null) process.stdout.write(`(${label}: exit ${result.status})\n`);
}

function printHostPreflight() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        WHISKAY BOT · BACKGROUND START / HOST PREFLIGHT      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  runPreflight('architecture', 'uname', ['-m']);
  const system = spawnSync('which', ['cloudflared'], { cwd: ROOT, encoding: 'utf8', timeout: 5000, env: process.env });
  const systemPath = system.status === 0 ? String(system.stdout || '').trim() : '';
  console.log(`\nCloudflared system PATH : ${systemPath || 'NOT FOUND'}`);
  for (const relative of ['bin/cloudflared-linux-arm64', 'data/bin/cloudflared-linux-arm64']) {
    const candidate = path.join(ROOT, relative);
    try {
      const stat = statSync(candidate);
      console.log(`Bundled binary          : ${relative} (${stat.size} bytes)`);
    } catch {
      console.log(`Bundled binary          : ${relative} (not installed; optional)`);
    }
  }
  const executable = systemPath || [path.join(ROOT, 'data/bin/cloudflared-linux-arm64'), path.join(ROOT, 'bin/cloudflared-linux-arm64')].find(candidate => {
    try { return (statSync(candidate).mode & 0o111) !== 0; } catch { return false; }
  });
  if (executable) {
    const version = spawnSync(executable, ['--version'], { cwd: ROOT, encoding: 'utf8', timeout: 5000, env: process.env });
    console.log(`Cloudflared executable  : ${!version.error && version.status === 0 ? 'READY' : 'FOUND BUT NOT RUNNABLE'}`);
    if (version.stdout) console.log(`Cloudflared version      : ${version.stdout.trim()}`);
    if (version.error) console.log(`Cloudflared check error  : ${version.error.message}`);
  } else {
    console.log('Cloudflared executable  : NOT FOUND (tunnel services will retry; bot can still start)');
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    const cwd = readlinkSync(`/proc/${pid}/cwd`);
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    return cwd === ROOT && cmdline.includes('scripts/start.mjs');
  } catch (error) {
    if (error.code === 'EPERM') return true;
    // On non-Linux hosts /proc may be unavailable. A live PID is treated
    // conservatively as occupied; this is safer than launching a duplicate bot.
    if (error.code === 'ENOENT' || error.code === 'EACCES') {
      try { process.kill(pid, 0); return true; } catch (probe) { return probe.code === 'EPERM'; }
    }
    return false;
  }
}

function managerIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return readlinkSync(`/proc/${pid}/cwd`) === ROOT && readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('scripts/daemon.mjs');
  } catch (error) {
    if (error.code === 'EPERM') return true;
    if (error.code === 'ENOENT' || error.code === 'EACCES') {
      try { process.kill(pid, 0); return true; } catch (probe) { return probe.code === 'EPERM'; }
    }
    return false;
  }
}

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
        const isLegacyEntry = argv.slice(1).some(arg => arg === 'src/index.js' || arg.endsWith('/src/index.js'));
        if (isLegacyEntry) return { pid, legacy: true, startedAt: 'legacy direct entrypoint' };
      } catch {}
    }
  } catch {}
  return null;
}

function readPidRecord(file = PID_FILE) {
  try {
    const record = JSON.parse(readFileSync(file, 'utf8'));
    const pid = Number(record.pid);
    if (processIsAlive(pid)) return { ...record, pid };
    unlinkSync(file);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      try {
        if (Date.now() - statSync(file).mtimeMs >= 20000) unlinkSync(file);
      } catch {}
    }
  }
  return null;
}

function acquireLaunchLock() {
  mkdirSync(RUNTIME, { recursive: true });
  try {
    const fd = openSync(LAUNCH_FILE, 'wx', 0o600);
    writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
    return fd;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner = null;
    try { owner = JSON.parse(readFileSync(LAUNCH_FILE, 'utf8')); } catch {}
    if (managerIsAlive(Number(owner?.pid))) return null;
    if (!owner) {
      try { if (Date.now() - statSync(LAUNCH_FILE).mtimeMs < 20000) return null; } catch {}
    }
    try { unlinkSync(LAUNCH_FILE); } catch {}
    try {
      const fd = openSync(LAUNCH_FILE, 'wx', 0o600);
      writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
      return fd;
    } catch { return null; }
  }
}

async function start() {
  printHostPreflight();
  mkdirSync(LOG_DIR, { recursive: true });
  const launchFd = acquireLaunchLock();
  if (launchFd === null) {
    const current = readPidRecord();
    console.log(current ? `Whiskay Bot sudah berjalan (PID ${current.pid}).` : 'Proses start lain sedang menyiapkan Whiskay Bot. Tidak membuat instance baru.');
    return current ? 0 : 73;
  }
  try {
    const existing = readPidRecord() || findLegacyBotProcess();
    if (existing) {
      console.log(`Whiskay Bot sudah berjalan${existing.legacy ? ' melalui entrypoint lama' : ''} (PID ${existing.pid}). Tidak membuat server/socket duplikat.`);
      if (existing.legacy) console.log('Hentikan instance lama dengan npm stop sebelum menjalankan versi daemon baru.');
      return existing.legacy ? 73 : 0;
    }

    const logFd = openSync(LOG_FILE, 'a', 0o600);
    let child;
    try {
      child = spawn(process.execPath, [path.join(ROOT, 'scripts/start.mjs')], {
        cwd: ROOT,
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: process.env
      });
    } catch (error) {
      closeSync(logFd);
      console.error(`Gagal membuat proses background: ${error.message}`);
      return 1;
    }
    closeSync(logFd);
    let spawnError = null;
    child.once('error', error => { spawnError = error; });
    child.unref();

    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const current = readPidRecord();
      if (current && current.pid === child.pid) {
        console.log(`✅ Whiskay Bot berjalan di background. PID: ${child.pid}`);
        console.log(`Log: ${LOG_FILE}`);
        console.log('Pantau: npm run logs · Status: npm run status · Hentikan: npm stop');
        return 0;
      }
      if (spawnError) break;
      if (child.exitCode !== null) break;
      await sleep(200);
    }
    console.error(`⚠️ Startup belum terkonfirmasi. Periksa log: ${LOG_FILE}`);
    if (spawnError) console.error(spawnError.message);
    try {
      const lines = spawnSync('tail', ['-n', '25', LOG_FILE], { encoding: 'utf8' });
      if (lines.stdout) process.stderr.write(lines.stdout);
    } catch {}
    return 1;
  } finally {
    try {
      const lock = JSON.parse(readFileSync(LAUNCH_FILE, 'utf8'));
      if (Number(lock.pid) === process.pid) unlinkSync(LAUNCH_FILE);
    } catch {}
    try { closeSync(launchFd); } catch {}
  }
}

async function stop() {
  const current = readPidRecord() || findLegacyBotProcess();
  if (!current) { console.log('Whiskay Bot tidak sedang berjalan.'); return 0; }
  console.log(`Mengirim SIGTERM ke Whiskay Bot PID ${current.pid}...`);
  try { process.kill(current.pid, 'SIGTERM'); }
  catch (error) { console.error(`Tidak dapat menghentikan proses: ${error.message}`); return 1; }
  const deadline = Date.now() + 18000;
  while (Date.now() < deadline) {
    if (!(readPidRecord() || findLegacyBotProcess())) { console.log('✅ Whiskay Bot berhenti dengan graceful shutdown.'); return 0; }
    await sleep(300);
  }
  console.error('⚠️ Proses belum berhenti setelah 18 detik. Tidak dipaksa SIGKILL; periksa log dan hentikan manual bila diperlukan.');
  return 1;
}

function status() {
  const current = readPidRecord() || findLegacyBotProcess();
  if (!current) { console.log('Whiskay Bot: STOPPED'); return 1; }
  console.log(`Whiskay Bot: RUNNING\nPID: ${current.pid}\nStarted: ${current.startedAt || 'unknown'}${current.legacy ? ' (legacy process)' : ''}\nLog: ${LOG_FILE}`);
  return 0;
}

const [command = 'start'] = process.argv.slice(2);
let exitCode;
if (command === 'start') exitCode = await start();
else if (command === 'stop') exitCode = await stop();
else if (command === 'restart') { const stopped = await stop(); exitCode = stopped === 0 ? await start() : stopped; }
else if (command === 'status') exitCode = status();
else if (command === 'logs') {
  const tail = spawn('tail', ['-n', '100', '-f', LOG_FILE], { cwd: ROOT, stdio: 'inherit' });
  tail.once('error', error => { console.error(`Gagal membuka log: ${error.message}`); process.exitCode = 1; });
} else {
  console.log('Usage: node scripts/daemon.mjs start|stop|restart|status|logs');
  exitCode = 64;
}
if (Number.isInteger(exitCode)) process.exitCode = exitCode;

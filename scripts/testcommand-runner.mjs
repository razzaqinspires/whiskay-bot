import { cp, mkdir, mkdtemp, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DEFAULT_INSTALL_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_VERIFY_TIMEOUT_MS = 45 * 60 * 1000;
const DEFAULT_TEST_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_CAPTURE_BYTES = 12 * 1024 * 1024;
const MAX_DIAGNOSTIC_FILES = 40;
const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const SECRET_NAME = /(?:API[_-]?KEY|ACCESS[_-]?TOKEN|REFRESH[_-]?TOKEN|CLIENT[_-]?SECRET|PASSWORD|PASSWD|COOKIE|SESSION|AUTH(?:ORIZATION)?|PRIVATE[_-]?KEY|WEBHOOK[_-]?(?:SECRET|URL)|TOKEN|(?:^|[_-])PAT(?:$|[_-])|DUNGEON[_-]?SYNC[_-]?TOKEN|GITHUB[_-]?TOKEN|WHATSAPP[_-]?TOKEN)/i;
const CAPTURED_SECRET_VALUES = [...new Set(Object.entries(process.env)
  .filter(([key, value]) => SECRET_NAME.test(key) && typeof value === 'string' && value.length >= 6)
  .map(([, value]) => value))].sort((a, b) => b.length - a.length);
const SECRET_VALUE_PATTERNS = [
  /(\b(?:authorization|proxy-authorization)\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi,
  /((?:[A-Z0-9_]*(?:API[_-]?KEY|ACCESS[_-]?TOKEN|REFRESH[_-]?TOKEN|CLIENT[_-]?SECRET|PASSWORD|PASSWD|COOKIE|SESSION|AUTH(?:ORIZATION)?|PRIVATE[_-]?KEY|WEBHOOK[_-]?(?:SECRET|URL)|TOKEN|PAT))\s*[:=]\s*)["']?[^\s,"']+/gi,
  /(\bBearer\s+)[A-Za-z0-9._~+\/-]+=*/gi,
];

const isoNow = () => new Date().toISOString();
const safeId = () => `${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`;
const normalize = value => String(value || '').replaceAll('\\', '/');
const trimText = (value, max = 9000) => String(value || '').slice(0, max);

export function redactText(value) {
  let output = String(value ?? '');
  for (const pattern of SECRET_VALUE_PATTERNS) output = output.replace(pattern, '$1[REDACTED]');
  output = output.replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, '$1[REDACTED]@');
  for (const secret of CAPTURED_SECRET_VALUES) output = output.split(secret).join('[REDACTED]');
  return output;
}

export function shouldCopyProjectPath(sourcePath, projectRoot) {
  const rel = normalize(path.relative(projectRoot, sourcePath));
  if (!rel || rel === '.') return true;
  const parts = rel.split('/');
  const privateDirectories = new Set([
    '.git', 'node_modules', '.runtime', '.test-runtime', '.cache', 'coverage', '.next', '.turbo',
    'data', 'sessions', 'session', 'auth_info_baileys', 'baileys_auth_info', '.whatsapp-session',
    'whatsapp-session', 'whatsapp-sessions', '.wwebjs_auth', '.wwebjs_cache', 'logs', 'tmp',
    'temp', 'downloads', 'cache', 'dist', 'build', 'test-reports',
  ]);
  if (parts.some(part => privateDirectories.has(part.toLowerCase()))) return false;
  const base = parts.at(-1) || '';
  if (base === '.env' || (base.startsWith('.env.') && (base !== '.env.example' || rel !== '.env.example'))) return false;
  if (base === '.npmrc' || base === '.netrc') return false;
  if (/^(?:credentials|secrets|token)\.json$/i.test(base) || /^service-account.*\.json$/i.test(base)) return false;
  if (/\.(?:db(?:-wal|-shm|-journal)?|sqlite(?:3)?(?:-wal|-shm|-journal)?|realm|rdb|ldb|sst|mdb|mdf|ldf|ibd|frm|myd|myi|dump|bak|backup|pem|key|p12|pfx|jks|keystore|p8|der|crt|cer|asc|secret|secrets|session|cookie|log|tap)$/i.test(base) || /\.log\..+$/i.test(base)) return false;
  if (rel === 'test/reports' || rel.startsWith('test/reports/')) return false;
  return true;
}

export function parseTestSummary(output) {
  const text = String(output || '');
  const reporterSummaries = [...text.matchAll(/^\s*\{.*"source":"whiskay-node-test".*"type":"summary".*\}\s*$/gm)]
    .map(match => { try { return JSON.parse(match[0]); } catch { return null; } })
    .filter(Boolean);
  if (reporterSummaries.length) {
    const totals = reporterSummaries.reduce((acc, item) => ({
      tests: acc.tests + Number(item.tests ?? item.counts?.completed ?? 0),
      passed: acc.passed + Number(item.passed ?? item.counts?.passed ?? 0),
      failed: acc.failed + Number(item.failed ?? item.counts?.failed ?? 0),
      skipped: acc.skipped + Number(item.skipped ?? item.counts?.skipped ?? 0),
    }), { tests: 0, passed: 0, failed: 0, skipped: 0 });
    return { ...totals, cancelled: null };
  }
  // Parse the compact summary emitted by scripts/run-tests.mjs, including multi-run aggregates.
  const whiskaySummaries = [...text.matchAll(/^\s*Test:\s*(\d+)\s*\/\s*(\d+)\s*lulus\s*[·,;]\s*(\d+)\s*gagal\s*[·,;]\s*(\d+)\s*skip\b.*$/gim)];
  if (whiskaySummaries.length) {
    return whiskaySummaries.reduce((acc, match) => ({
      tests: acc.tests + Number(match[2]),
      passed: acc.passed + Number(match[1]),
      failed: acc.failed + Number(match[3]),
      skipped: acc.skipped + Number(match[4]),
      cancelled: null,
    }), { tests: 0, passed: 0, failed: 0, skipped: 0, cancelled: null });
  }

  const sum = pattern => {
    const matches = [...text.matchAll(pattern)];
    return matches.length ? matches.reduce((total, match) => total + Number(match[1]), 0) : null;
  };
  return {
    // verify:all invokes multiple node --test subprocesses; aggregate every TAP summary.
    tests: sum(/(?:ℹ\s*tests|#\s*tests)\s+(\d+)/g),
    passed: sum(/(?:ℹ\s*pass|#\s*pass)\s+(\d+)/g),
    failed: sum(/(?:ℹ\s*fail|#\s*fail)\s+(\d+)/g),
    skipped: sum(/(?:ℹ\s*skipped|#\s*skipped)\s+(\d+)/g),
    cancelled: sum(/(?:ℹ\s*cancelled|#\s*cancelled)\s+(\d+)/g),
  };
}

export function classifyFailure(output) {
  const text = String(output || '');
  if (/UPLOAD BLOCKED|BLOCK not ignored|BLOCK still tracked:|token\/private key ditemukan|database.*tidak akan dipaksa masuk GitHub/i.test(text)) {
    return {
      code: 'PRIVATE_DATA_GUARD_BLOCKED',
      category: 'SECURITY',
      severity: 'critical',
      explanation: 'Upload dihentikan karena audit menemukan path privat, kredensial, database/sesi yang masih tracked, secret, atau aturan .gitignore yang tidak berlaku.',
      recommendedAction: 'Biarkan data dan sesi tetap lokal. Periksa path dan aturan ignore, keluarkan file dari Git index tanpa menghapus salinan lokal, rotasi credential jika pernah terunggah, lalu jalankan ulang git upload.',
    };
  }
  if (/NPM_AUDIT_RESULT=FAIL_HIGH_OR_CRITICAL|GHSA-jpjx-r3gh-v5pf|GHSA-8v3r-r9vg-5r66/i.test(text)) {
    return {
      code: 'DEPENDENCY_SUPPLY_CHAIN_BLOCKED',
      category: 'DEPENDENCY_SECURITY',
      severity: 'critical',
      explanation: 'npm audit menemukan rilis dependency yang ditandai malware oleh GitHub Advisory Database. Host yang memasang rilis terdampak harus diperlakukan sebagai berpotensi kompromi.',
      recommendedAction: 'Gunakan perangkat bersih untuk rotasi semua kredensial yang dapat diakses host terdampak. Kunci versi tidak terdampak di package.json/package-lock.json, lalu verifikasi instalasi di runner bersih sebelum menjalankan bot kembali.',
    };
  }
  if (/Could not find ['\"]?[^\n]*sessions[\\/]pre-key-\d+\.json/i.test(text)) {
    return {
      code: 'BAILEYS_PREKEY_FILE_MISSING',
      category: 'SESSION_RUNTIME_REFERENCE',
      severity: 'warning',
      explanation: 'Node menemukan referensi ke file pre-key sesi Baileys yang tidak ada. Ini perlu ditelusuri sebagai masalah fixture/isolation atau sesi runtime; jangan membuat file pre-key palsu dan jangan menghapus folder sessions.',
      recommendedAction: 'Pastikan test tidak memuat sesi WhatsApp produksi. Gunakan mock auth state/temp directory terisolasi, lalu jalankan ulang test terkait.',
    };
  }
  if (/EAI_AGAIN|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(text)) return {
    code: 'NETWORK_OR_REGISTRY_UNAVAILABLE', category: 'ENVIRONMENT', severity: 'warning',
    explanation: 'Koneksi jaringan/registry terputus; hasil ini tidak boleh dihitung sebagai assertion failure.',
    recommendedAction: 'Periksa DNS, koneksi, dan registry lalu ulangi instalasi atau QA.',
  };
  return null;
}

function resolveDiagnosticPath(rawPath, projectRoot) {
  let candidate = String(rawPath || '').replace(/[),;]+$/, '');
  try {
    if (candidate.startsWith('file://')) candidate = fileURLToPath(candidate);
    else candidate = decodeURIComponent(candidate);
  } catch {}
  if (path.isAbsolute(candidate)) {
    const rel = path.relative(projectRoot, candidate);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return normalize(rel);
  }
  const rel = normalize(candidate).replace(/^\.\//, '');
  if (rel.startsWith('../') || path.isAbsolute(rel)) return null;
  return rel;
}

export function parseFailureLocations(output, projectRoot = process.cwd()) {
  const text = String(output || '');
  const found = new Map();
  const patterns = [
    /((?:file:\/\/\/[^\s():]+?|(?:[A-Za-z]:)?\/[^\s():]+?|\.\.?\/[^\s():]+?)\.(?:mjs|cjs|js|json|ts|tsx|jsx)):(\d+)(?::(\d+))?/g,
    /((?:test|src|scripts|config)\/[A-Za-z0-9_@./-]+?\.(?:mjs|cjs|js|json|ts|tsx|jsx)):(\d+)(?::(\d+))?/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const file = resolveDiagnosticPath(match[1], projectRoot);
      const line = Number(match[2]);
      const column = match[3] ? Number(match[3]) : null;
      if (!file || !Number.isInteger(line) || line < 1) continue;
      if (file.split('/').some(part => ['node_modules', '.git', 'data', 'sessions'].includes(part))) continue;
      const key = `${file}:${line}:${column ?? ''}`;
      if (!found.has(key)) found.set(key, { file, line, column, source: 'stack-or-runner-output' });
    }
  }
  return [...found.values()].slice(0, MAX_DIAGNOSTIC_FILES);
}

export function extractFailureLines(output) {
  const lines = String(output || '').split(/\r?\n/);
  const markers = /^(?:\[FAIL\]|WHISKAY TEST RESULT:\s*FAIL|not ok\s+\d+|✖|\s*AssertionError|\s*(?:Error|TypeError|ReferenceError|SyntaxError|ERR_[A-Z_]+):|npm error|npm ERR!|UPLOAD BLOCKED|BLOCK(?:ED)?(?:\s|:)|FAIL\b)/i;
  const selected = [];
  for (let i = 0; i < lines.length; i++) {
    if (!markers.test(lines[i])) continue;
    const start = Math.max(0, i - 1);
    const end = Math.min(lines.length, i + 7);
    for (let j = start; j < end; j++) selected.push(`${j + 1}: ${lines[j]}`);
    selected.push('');
    if (selected.length >= 180) break;
  }
  return [...new Set(selected)].join('\n').slice(0, 24000);
}

async function walkCodeFiles(root, directories = ['src', 'scripts', 'test', 'config', 'automation']) {
  const files = [];
  let rootEntries = [];
  try { rootEntries = await readdir(root, { withFileTypes: true }); } catch {}
  for (const entry of rootEntries) {
    if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name))) files.push(path.join(root, entry.name));
  }
  const walk = async dir => {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'reports') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
    }
  };
  for (const dir of directories) await walk(path.join(root, dir));
  return files;
}

async function runProcess({ command, args, cwd, env, timeoutMs, onOutput }) {
  const startedAt = Date.now();
  const stdoutChunks = [];
  const stderrChunks = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stdoutTruncated = false;
  let stderrTruncated = false;
  let settled = false;
  let timeout = null;
  let child;

  const capture = (chunks, chunk, currentBytes, isStdout) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    const remaining = Math.max(0, MAX_CAPTURE_BYTES - currentBytes);
    if (remaining > 0) chunks.push(buffer.subarray(0, remaining));
    if (buffer.length > remaining) {
      if (isStdout) stdoutTruncated = true;
      else stderrTruncated = true;
    }
    return currentBytes + buffer.length;
  };

  const outcome = await new Promise(resolve => {
    try {
      child = spawn(command, args, {
        cwd,
        env,
        windowsHide: true,
        shell: process.platform === 'win32' && command.toLowerCase().endsWith('.cmd'),
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({ exitCode: null, signal: null, spawnError: error.message });
      return;
    }
    child.stdout.on('data', chunk => {
      stdoutBytes = capture(stdoutChunks, chunk, stdoutBytes, true);
      onOutput?.('stdout', chunk);
    });
    child.stderr.on('data', chunk => {
      stderrBytes = capture(stderrChunks, chunk, stderrBytes, false);
      onOutput?.('stderr', chunk);
    });
    let timedOut = false;
    let hardStop = null;
    const signalTree = signal => {
      if (!child?.pid) return;
      if (process.platform === 'win32') {
        try { child.kill(signal); } catch {}
      } else {
        try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch {} }
      }
    };
    child.once('error', error => {
      if (settled) return;
      settled = true;
      resolve({ exitCode: null, signal: null, spawnError: error.message });
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      if (hardStop) clearTimeout(hardStop);
      resolve({ exitCode: code, signal, spawnError: timedOut ? `Timeout setelah ${timeoutMs} ms` : null });
    });
    timeout = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      signalTree('SIGTERM');
      hardStop = setTimeout(() => {
        signalTree('SIGKILL');
        if (!settled) {
          settled = true;
          resolve({ exitCode: null, signal: 'TIMEOUT', spawnError: `Timeout setelah ${timeoutMs} ms` });
        }
      }, 10_000);
      hardStop.unref?.();
    }, timeoutMs);
    timeout.unref?.();
  });
  if (timeout) clearTimeout(timeout);
  const stdout = Buffer.concat(stdoutChunks).toString('utf8') + (stdoutTruncated ? '\n[stdout dipotong: batas penyimpanan tercapai]\n' : '');
  const stderr = Buffer.concat(stderrChunks).toString('utf8') + (stderrTruncated ? '\n[stderr dipotong: batas penyimpanan tercapai]\n' : '');
  return {
    command: [command, ...args].join(' '),
    exitCode: outcome.exitCode,
    signal: outcome.signal,
    spawnError: outcome.spawnError,
    ok: outcome.exitCode === 0 && !outcome.spawnError,
    durationMs: Date.now() - startedAt,
    stdout: redactText(stdout),
    stderr: redactText(stderr),
    stdoutTruncated,
    stderrTruncated,
  };
}

async function syntaxAudit(projectRoot, env, onProgress) {
  const files = await walkCodeFiles(projectRoot);
  const results = new Array(files.length);
  let nextIndex = 0;
  const workerCount = Math.min(4, Math.max(1, files.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= files.length) return;
      const file = files[index];
      const result = await runProcess({
        command: process.execPath,
        args: ['--check', file],
        cwd: projectRoot,
        env,
        timeoutMs: 15_000,
      });
      results[index] = {
        file: normalize(path.relative(projectRoot, file)),
        ok: result.ok,
        exitCode: result.exitCode,
        stderr: result.ok ? '' : trimText(result.stderr || result.spawnError, 3000),
        stdout: result.ok ? '' : trimText(result.stdout, 1000),
      };
      const completed = results.filter(Boolean).length;
      const failed = results.filter(item => item && !item.ok).length;
      if (completed === 1 || completed % 10 === 0 || completed === files.length || !result.ok) {
        onProgress?.({ type: 'syntax-progress', completed, total: files.length, passed: completed - failed, failed, latest: results[index] });
      }
    }
  });
  await Promise.all(workers);
  onProgress?.({ type: 'syntax-complete', checked: files.length, failed: results.filter(x => !x.ok).length });
  return results;
}

function testEnvironment(sandboxRoot) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (SECRET_NAME.test(key) || /^(?:NODE_OPTIONS|npm_config_userconfig|NPM_CONFIG_USERCONFIG)$/i.test(key)) continue;
    env[key] = value;
  }
  Object.assign(env, {
    CI: '1',
    NODE_ENV: 'test',
    WHISKAY_TEST_MODE: '1',
    WHISKAY_DATA_DIR: path.join(sandboxRoot, 'data', 'test-runtime'),
    SESSION_DIR: path.join(sandboxRoot, '.test-runtime', 'sessions'),
    JADIBOT_DATA_DIR: path.join(sandboxRoot, 'data', 'test-jadibot'),
    JADIBOT_TUNNEL: 'off',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
  });
  return env;
}

async function createSandbox(projectRoot) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'whiskay-testcommand-'));
  const sandboxRoot = path.join(parent, 'project');
  await mkdir(sandboxRoot, { recursive: true });
  try {
    await cp(projectRoot, sandboxRoot, {
      recursive: true,
      force: true,
      dereference: false,
      filter: sourcePath => shouldCopyProjectPath(sourcePath, projectRoot),
    });
    return { parent, sandboxRoot };
  } catch (error) {
    await rm(parent, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function numberedExcerpt(filePath, line, projectRoot, radius = 6) {
  try {
    const info = await stat(filePath);
    if (!info.isFile() || info.size > 2 * 1024 * 1024) return null;
    const source = await readFile(filePath, 'utf8');
    const rows = source.split(/\r?\n/);
    const from = Math.max(1, line - radius);
    const to = Math.min(rows.length, line + radius);
    return {
      file: normalize(path.relative(projectRoot, filePath)),
      focusLine: line,
      fromLine: from,
      toLine: to,
      content: rows.slice(from - 1, to).map((text, index) => `${String(from + index).padStart(5, ' ')}${from + index === line ? ' > ' : '   '}${redactText(text)}`).join('\n'),
    };
  } catch { return null; }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

export function createZipBuffer(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const stamp = dosDateTime();
  for (const entry of entries) {
    const name = Buffer.from(normalize(entry.name).replace(/^\/+/, ''), 'utf8');
    const input = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data ?? ''), 'utf8');
    const compressed = deflateRawSync(input, { level: 6 });
    const crc = crc32(input);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(input.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(input.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}

function makeStep(name, result, startedAt, endedAt = isoNow()) {
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  return {
    name,
    startedAt,
    endedAt,
    durationMs: result.durationMs,
    ok: result.ok,
    exitCode: result.exitCode,
    signal: result.signal,
    spawnError: result.spawnError,
    command: result.command,
    summary: parseTestSummary(output),
    stdout: result.stdout,
    stderr: result.stderr,
    stdoutTruncated: result.stdoutTruncated,
    stderrTruncated: result.stderrTruncated,
  };
}

async function acquireRunLock(projectRoot, runId) {
  const lockPath = path.join(projectRoot, 'test', '.testcommand.lock');
  await mkdir(path.dirname(lockPath), { recursive: true });
  try {
    const handle = await open(lockPath, 'wx', 0o600);
    await handle.writeFile(JSON.stringify({ pid: process.pid, runId, startedAt: isoNow() }));
    await handle.close();
    return async () => rm(lockPath, { force: true });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let lock = null;
    try { lock = JSON.parse(await readFile(lockPath, 'utf8')); } catch {}
    if (lock?.pid && Number.isInteger(lock.pid)) {
      try { process.kill(lock.pid, 0); } catch (probeError) {
        if (probeError.code === 'ESRCH') {
          await rm(lockPath, { force: true });
          return acquireRunLock(projectRoot, runId);
        }
      }
    }
    throw new Error(`QA lain sedang berjalan (PID ${lock?.pid ?? 'unknown'}, run ${lock?.runId ?? 'unknown'}). Tunggu selesai sebelum menjalankan ulang.`);
  }
}

async function writeFailureArchive({ projectRoot, report, reportDir }) {
  const combinedOutput = report.steps.map(step => `===== ${step.name} =====\n${step.stdout}\n${step.stderr}`).join('\n');
  const locations = parseFailureLocations(combinedOutput, report.sandboxRoot);
  const excerpts = [];
  for (const location of locations) {
    const absolute = path.resolve(report.sandboxRoot, location.file);
    if (!absolute.startsWith(`${report.sandboxRoot}${path.sep}`)) continue;
    const excerpt = await numberedExcerpt(absolute, location.line, report.sandboxRoot);
    if (excerpt) excerpts.push(excerpt);
  }
  report.failureLocations = locations;
  report.sourceExcerpts = excerpts;
  report.failureLines = extractFailureLines(combinedOutput);
  const safeManifest = {
    id: report.id,
    status: 'FAILED',
    createdAt: report.createdAt,
    finishedAt: report.finishedAt,
    durationMs: report.durationMs,
    node: report.node,
    platform: report.platform,
    failedSteps: report.steps.filter(step => !step.ok).map(step => ({ name: step.name, exitCode: step.exitCode, signal: step.signal, spawnError: step.spawnError, durationMs: step.durationMs, classification: step.classification || null })),
    failureLocations: locations,
    testSummary: report.steps.map(step => ({ name: step.name, ok: step.ok, ...step.summary })),
    syntaxSummary: { checked: report.syntax.checked, failed: report.syntax.failed },
    security: 'No .env, npm credentials file, node_modules, WhatsApp session, user database or runtime state is included.',
  };
  const overview = [
    '# WHISKAY BOT — FAILURE DIAGNOSTIC',
    '',
    `- Run ID: ${report.id}`,
    `- Started: ${report.createdAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Duration: ${(report.durationMs / 1000).toFixed(1)} seconds`,
    `- Node: ${report.node} (${report.platform})`,
    `- Failed step(s): ${safeManifest.failedSteps.map(step => step.name).join(', ') || 'Unknown'}`,
    ...safeManifest.failedSteps.filter(step => step.classification).map(step => `- Classification (${step.name}): ${step.classification.category} / ${step.classification.code} — ${step.classification.recommendedAction}`),
    '',
    '## Exact failure locations',
    ...(locations.length ? locations.map((item, index) => `${index + 1}. \`${item.file}:${item.line}${item.column ? `:${item.column}` : ''}\``) : ['No file/line reference could be extracted from the runner output. See complete logs below.']),
    '',
    '## Syntax audit',
    `- Checked: ${report.syntax.checked}`,
    `- Failed: ${report.syntax.failed}`,
    ...(report.syntax.failures.length ? report.syntax.failures.map(item => `- ${item.file}: ${item.stderr || item.stdout}`) : ['- No syntax errors detected.']),
    '',
    '## Error excerpts',
    report.failureLines || 'No TAP/error marker was extracted. Review the full logs.',
    '',
    '## Numbered source context',
    ...(excerpts.length ? excerpts.map(item => `### ${item.file} (focus line ${item.focusLine})\n\n\`\`\`text\n${item.content}\n\`\`\``) : ['No safe first-party source excerpt was available.']),
    '',
    '## Security boundary',
    safeManifest.security,
    'This archive is a diagnostic bundle, not a project backup. Do not attach the project .env or session files to a public issue.',
  ].join('\n');

  const entries = [
    { name: 'README-DIAGNOSTIC.md', data: redactText(overview) },
    { name: 'manifest.json', data: JSON.stringify(safeManifest, null, 2) },
    { name: 'failure-locations.json', data: JSON.stringify(locations, null, 2) },
    { name: 'source-excerpts.json', data: JSON.stringify(excerpts, null, 2) },
    { name: 'failure-lines.txt', data: report.failureLines || 'No failure marker extracted.' },
  ];
  for (const step of report.steps) {
    const base = `logs/${step.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`;
    entries.push({ name: `${base}.stdout.log`, data: step.stdout || '' });
    entries.push({ name: `${base}.stderr.log`, data: step.stderr || '' });
  }
  for (const step of report.steps.filter(item => !item.ok)) {
    entries.push({ name: `failed-step-${step.name}.json`, data: JSON.stringify({ ...step, stdout: undefined, stderr: undefined }, null, 2) });
  }
  for (const rel of ['package.json', 'package-lock.json']) {
    try {
      const metadataText = await readFile(path.join(report.sandboxRoot, rel), 'utf8');
      entries.push({ name: `project-metadata/${rel}`, data: redactText(metadataText) });
    } catch {}
  }
  for (const excerpt of excerpts) {
    const relative = `source-context/${excerpt.file}`;
    entries.push({ name: relative, data: excerpt.content });
  }

  await mkdir(reportDir, { recursive: true });
  const zipPath = path.join(reportDir, `WHISKAY-VERIFY-FAILURE-${report.id}.zip`);
  const buffer = createZipBuffer(entries);
  const temporary = `${zipPath}.tmp`;
  await writeFile(temporary, buffer, { mode: 0o600 });
  await rename(temporary, zipPath);
  const archives = (await readdir(reportDir)).filter(name => /^WHISKAY-VERIFY-FAILURE-.*\.zip$/i.test(name)).sort().reverse();
  for (const stale of archives.slice(20)) await rm(path.join(reportDir, stale), { force: true });
  return { zipPath, locations, excerptCount: excerpts.length, sizeBytes: buffer.length };
}

function makeSuccessReport(report) {
  const stepRows = report.steps.map(step => `| ${step.name} | ${step.ok ? 'PASS' : 'FAIL'} | ${(step.durationMs / 1000).toFixed(1)} | ${step.exitCode ?? '—'} |`).join('\n');
  const summaries = report.steps.map(step => `- **${step.name}:** ${step.ok ? 'PASS' : 'FAIL'}${step.summary.tests !== null ? ` — ${step.summary.passed ?? 0}/${step.summary.tests} passed` : ''}`).join('\n');
  return [
    '# WHISKAY BOT — LAST SUCCESSFUL FULL VERIFICATION',
    '',
    `- Run ID: \`${report.id}\``,
    `- Finished: ${report.finishedAt}`,
    `- Duration: ${(report.durationMs / 1000).toFixed(1)} seconds`,
    `- Node.js: ${report.node} (${report.platform})`,
    `- Project version: ${report.projectVersion}`,
    '',
    '## Release gate',
    '',
    '| Phase | Result | Duration (s) | Exit code |',
    '|---|---:|---:|---:|',
    stepRows,
    '',
    '## Syntax audit',
    `- JavaScript files checked: ${report.syntax.checked}`,
    `- Syntax failures: ${report.syntax.failed}`,
    '',
    '## Verification summaries',
    summaries,
    '',
    '## Scope and limitations',
    '- Dependencies were installed with `npm ci` inside a disposable isolated copy of the project.',
    '- `npm run verify:all` and `npm test` completed with exit code 0.',
    '- Source syntax was checked with `node --check` across `src/`, `scripts/`, `test/`, and `config/`.',
    '- Command plugins were inventoried but never invoked as live WhatsApp commands; tests do not constitute a live WhatsApp/device/provider integration test.',
    '- The live project `node_modules`, `.env`, session directories, and user databases were not modified or copied into the test sandbox.',
    '',
    'This file is overwritten only after a completely successful run. A failed run creates a separate ZIP diagnostic bundle and does not replace this success record.',
    '',
  ].join('\n');
}

async function atomicWrite(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, filePath);
}

function createStepProgress(stepName, onProgress) {
  let pending = '';
  const counts = { discovered: 0, completed: 0, passed: 0, failed: 0, skipped: 0 };
  let lastPublished = 0;
  const publish = (force = false, latest = null) => {
    const shouldPublish = force || counts.completed === 1 || counts.completed % 5 === 0 || latest?.type === 'fail';
    if (!shouldPublish || counts.completed === lastPublished) return;
    lastPublished = counts.completed;
    onProgress?.({ type: 'test-progress', step: stepName, counts: { ...counts }, latest });
  };
  const consume = chunk => {
    pending += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('{')) {
        try {
          const event = JSON.parse(trimmed);
          if (event.source === 'whiskay-run-tests' && event.type === 'preflight') {
            onProgress?.({ type: 'test-discovery', step: stepName, files: Number(event.discoveredFiles || 0), ignored: event.ignored || [], isolated: Boolean(event.isolated) });
            continue;
          }
          if (event.source === 'whiskay-node-test') {
            if (event.type === 'discovered') counts.discovered = Math.max(counts.discovered, Number(event.counts?.discovered || 0));
            if (event.type === 'pass' || event.type === 'fail') {
              counts.discovered = Math.max(counts.discovered, Number(event.counts?.discovered || 0));
              counts.completed = Number(event.counts?.completed || counts.completed + 1);
              counts.passed = Number(event.counts?.passed || 0);
              counts.failed = Number(event.counts?.failed || 0);
              counts.skipped = Number(event.counts?.skipped || 0);
              publish(false, { type: event.type, name: event.name, file: event.file, line: event.line });
            }
            if (event.type === 'summary') {
              counts.discovered = Math.max(counts.discovered, Number(event.counts?.discovered || 0));
              counts.completed = Number(event.counts?.completed || 0);
              counts.passed = Number(event.counts?.passed || 0);
              counts.failed = Number(event.counts?.failed || 0);
              counts.skipped = Number(event.counts?.skipped || 0);
              publish(true, { type: 'summary' });
            }
            continue;
          }
        } catch {}
      }
      // TAP stream from verify:all's nested `node --test` processes.
      if (/^(?:not\s+)?ok\s+\d+\b/.test(trimmed)) {
        counts.completed += 1;
        if (/^not\s+ok\b/.test(trimmed)) counts.failed += 1;
        else counts.passed += 1;
        publish(false, { type: /^not\s+ok\b/.test(trimmed) ? 'fail' : 'pass', name: trimmed.replace(/^(?:not\s+)?ok\s+\d+\s*-?\s*/, '').slice(0, 180) });
      }
      // TAP does not expose a stable global denominator until each nested test process ends.
      // Keep the live counter honest; the final exact total comes from parsed TAP summaries.
    }
  };
  return { consume, flush: () => { if (pending) consume('\n'); }, snapshot: () => ({ ...counts }) };
}

export async function runRepositoryVerification({ projectRoot = process.cwd(), onProgress } = {}) {
  const root = path.resolve(projectRoot);
  const pkgPath = path.join(root, 'package.json');
  const lockPath = path.join(root, 'package-lock.json');
  const id = safeId();
  const releaseLock = await acquireRunLock(root, id);
  const startedAt = isoNow();
  const startedMs = Date.now();
  let sandbox = null;
  const report = {
    id,
    status: 'RUNNING',
    createdAt: startedAt,
    finishedAt: null,
    durationMs: 0,
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    projectVersion: 'unknown',
    projectRoot: root,
    sandboxRoot: null,
    steps: [],
    syntax: { checked: 0, failed: 0, failures: [] },
    command: 'npm ci → node --check → npm run verify:all → npm test',
  };
  const reportDir = path.join(root, 'test', 'reports', 'diagnostics');
  try {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    report.projectVersion = pkg.version || 'unknown';
    if (!pkg.scripts?.['verify:all']) throw new Error('package.json tidak mendefinisikan scripts.verify:all. QA dibatalkan.');
    await stat(lockPath);

    onProgress?.({ type: 'start', id, message: 'Menyiapkan sandbox sementara yang terisolasi dari data live.' });
    sandbox = await createSandbox(root);
    report.sandboxRoot = sandbox.sandboxRoot;
    const env = testEnvironment(sandbox.sandboxRoot);
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    const runStep = async (name, args, timeoutMs, phaseMessage, stepEnv = env) => {
      onProgress?.({ type: 'step-start', id, step: name, message: phaseMessage });
      const stepStarted = isoNow();
      const progress = createStepProgress(name, onProgress);
      const result = await runProcess({ command: npm, args, cwd: sandbox.sandboxRoot, env: stepEnv, timeoutMs, onOutput: (_stream, chunk) => progress.consume(chunk) });
      progress.flush();
      const step = makeStep(name, result, stepStarted);
      const sessionClassification = classifyFailure(`${step.stdout || ''}\n${step.stderr || ''}\n${step.spawnError || ''}`);
      if (sessionClassification) step.classification = sessionClassification;
      if (name === 'npm-test' && !step.summary?.tests) {
        const liveCounts = progress.snapshot();
        if (liveCounts.completed || liveCounts.discovered) step.summary = {
          tests: liveCounts.completed, passed: liveCounts.passed, failed: liveCounts.failed,
          skipped: liveCounts.skipped, cancelled: null,
        };
      }
      report.steps.push(step);
      onProgress?.({ type: 'step-complete', id, step: name, ok: step.ok, exitCode: step.exitCode, durationMs: step.durationMs, summary: step.summary || null, classification: step.classification || null });
      return step;
    };

    const install = await runStep('npm-ci', ['ci', '--no-audit', '--no-fund'], Number(process.env.WHISKAY_TESTCOMMAND_INSTALL_TIMEOUT_MS) || DEFAULT_INSTALL_TIMEOUT_MS, 'Menjalankan npm ci pada sandbox; node_modules bot aktif tidak disentuh.');
    if (install.ok) {
      const syntax = await syntaxAudit(sandbox.sandboxRoot, env, onProgress);
      report.syntax = {
        checked: syntax.length,
        failed: syntax.filter(item => !item.ok).length,
        failures: syntax.filter(item => !item.ok).slice(0, 80),
      };
      if (report.syntax.failed) {
        const failureText = report.syntax.failures.map(item => `${item.file}:\n${item.stderr || item.stdout}`).join('\n\n');
        report.steps.push(makeStep('node-check', {
          command: 'node --check <src|scripts|test|config files>',
          ok: false,
          exitCode: 1,
          signal: null,
          spawnError: null,
          durationMs: 0,
          stdout: '',
          stderr: failureText,
          stdoutTruncated: false,
          stderrTruncated: false,
        }, isoNow()));
      } else {
        report.steps.push(makeStep('node-check', {
          command: 'node --check <src|scripts|test|config files>',
          ok: true,
          exitCode: 0,
          signal: null,
          spawnError: null,
          durationMs: 0,
          stdout: `Syntax OK: ${syntax.length} files`,
          stderr: '',
          stdoutTruncated: false,
          stderrTruncated: false,
        }, isoNow()));
      }
      await runStep('verify-all', ['run', 'verify:all'], Number(process.env.WHISKAY_TESTCOMMAND_VERIFY_TIMEOUT_MS) || DEFAULT_VERIFY_TIMEOUT_MS, 'Menjalankan npm run verify:all dengan reporter TAP agar progres test dapat dihitung live.', { ...env, NODE_OPTIONS: '--test-reporter=tap' });
      await runStep('npm-test', ['test', '--', '--test-reporter=./scripts/testcommand-reporter.mjs'], Number(process.env.WHISKAY_TESTCOMMAND_TEST_TIMEOUT_MS) || DEFAULT_TEST_TIMEOUT_MS, 'Menjalankan npm test dengan reporter event Node.js agar progres setiap test dapat dipantau.');
    }

    report.finishedAt = isoNow();
    report.durationMs = Date.now() - startedMs;
    const failedSteps = report.steps.filter(step => !step.ok);
    report.status = failedSteps.length ? 'FAILED' : 'SUCCESS';
    if (report.status === 'SUCCESS') {
      const reportPath = path.join(root, 'test', 'reports', 'WHISKAY-VERIFY-SUCCESS.md');
      await atomicWrite(reportPath, makeSuccessReport(report));
      report.successReportPath = normalize(path.relative(root, reportPath));
      return report;
    }

    const archive = await writeFailureArchive({ projectRoot: root, report, reportDir });
    report.failureArchivePath = normalize(path.relative(root, archive.zipPath));
    report.failureLocations = archive.locations;
    report.sourceExcerptCount = archive.excerptCount;
    report.failureArchiveSizeBytes = archive.sizeBytes;
    return report;
  } catch (error) {
    report.finishedAt = isoNow();
    report.durationMs = Date.now() - startedMs;
    report.status = 'FAILED';
    report.steps.push(makeStep('runner', {
      command: 'testcommand-runner',
      ok: false,
      exitCode: null,
      signal: null,
      spawnError: error?.stack || error?.message || String(error),
      durationMs: 0,
      stdout: '',
      stderr: redactText(error?.stack || error?.message || String(error)),
      stdoutTruncated: false,
      stderrTruncated: false,
    }, isoNow()));
    report.sandboxRoot = sandbox?.sandboxRoot || root;
    try {
      const archive = await writeFailureArchive({ projectRoot: root, report, reportDir });
      report.failureArchivePath = normalize(path.relative(root, archive.zipPath));
      report.failureLocations = archive.locations;
      report.sourceExcerptCount = archive.excerptCount;
      report.failureArchiveSizeBytes = archive.sizeBytes;
    } catch (archiveError) {
      report.archiveError = redactText(archiveError?.message || String(archiveError));
    }
    return report;
  } finally {
    if (sandbox?.parent) await rm(sandbox.parent, { recursive: true, force: true }).catch(() => {});
    await releaseLock().catch(() => {});
  }
}

export function formatRunSummary(report, projectRoot = process.cwd()) {
  const verifySummary = report.steps.find(step => step.name === 'verify-all')?.summary || {};
  const testSummary = report.steps.find(step => step.name === 'npm-test')?.summary || {};
  const lines = [
    `Run ID: ${report.id}`,
    `Status: ${report.status}`,
    `Durasi total: ${(report.durationMs / 1000).toFixed(1)} detik`,
    `Versi Node: ${report.node} · ${report.platform}`,
    `Package: ${report.projectVersion}`,
    `Syntax: ${report.steps.some(step => step.name === 'node-check') ? `${report.syntax.checked - report.syntax.failed}/${report.syntax.checked} lulus` : 'BELUM DIJALANKAN'}`,
    `verify:all tests: ${verifySummary.passed ?? '—'}/${verifySummary.tests ?? '—'} lulus · ${verifySummary.failed ?? '—'} gagal`,
    `npm test discovery: ${testSummary.passed ?? '—'}/${testSummary.tests ?? '—'} lulus · ${testSummary.failed ?? '—'} gagal`,
    '',
    ...report.steps.map(step => `• ${step.name}: ${step.ok ? 'PASS' : 'FAIL'}${step.exitCode !== null ? ` (exit ${step.exitCode})` : ''} · ${(step.durationMs / 1000).toFixed(1)}s${step.classification ? `\n  Kategori: ${step.classification.category} · ${step.classification.code}\n  ${step.classification.recommendedAction}` : ''}`),
  ];
  if (report.status === 'SUCCESS') lines.push('', `Laporan sukses tunggal: ${report.successReportPath}`);
  else {
    lines.push('', `ZIP diagnostik: ${report.failureArchivePath || 'GAGAL DIBUAT'}`);
    if (report.failureLocations?.length) lines.push('', 'Titik error:', ...report.failureLocations.slice(0, 12).map(item => `• ${item.file}:${item.line}${item.column ? `:${item.column}` : ''}`));
    if (report.sourceExcerptCount) lines.push(`Cuplikan source ber-line number: ${report.sourceExcerptCount} titik`);
    if (report.archiveError) lines.push(`Kesalahan pembuatan ZIP: ${report.archiveError}`);
  }
  lines.push('', 'Tes berjalan pada sandbox sementara; node_modules, .env, sesi WhatsApp dan database live tidak disentuh. Command WhatsApp tidak dieksekusi satu per satu.');
  return lines.join('\n').slice(0, 7500);
}

// Keep a small CLI entry point for repeatable terminal usage and deployment diagnostics.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath === thisPath) {
  const projectRoot = path.resolve(process.argv[2] || process.cwd());
  console.log(`WHISKAY TESTCOMMAND · ${projectRoot}`);
  const report = await runRepositoryVerification({
    projectRoot,
    onProgress: event => {
      if (event.type === 'step-start') console.log(`\n[START] ${event.step} — ${event.message}`);
      else if (event.type === 'step-complete') console.log(`[${event.ok ? 'PASS' : 'FAIL'}] ${event.step} (exit ${event.exitCode ?? 'unknown'})`);
      else if (event.type === 'syntax-progress') console.log(`[SYNTAX] ${event.completed}/${event.total} files · ${event.passed} PASS · ${event.failed} FAIL`);
      else if (event.type === 'syntax-complete') console.log(`[SYNTAX] ${event.checked - event.failed}/${event.checked} files OK`);
      else if (event.type === 'test-progress') console.log(`[${event.step}] ${event.counts.completed} selesai · ${event.counts.passed} lulus · ${event.counts.failed} gagal · ${event.counts.discovered} ditemukan`);
    },
  });
  console.log(formatRunSummary(report, projectRoot));
  process.exitCode = report.status === 'SUCCESS' ? 0 : 1;
}

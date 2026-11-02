#!/usr/bin/env node
// Whiskay test entrypoint: bounded discovery, isolated runtime, concise terminal output,
// and one detailed ZIP report per invocation under data/test-reports/.
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createZipBuffer, redactText } from './testcommand-runner.mjs';

const DEFAULT_IGNORED_DIRS = [
  'node_modules', 'data', 'sessions', '.git', '.runtime', '.test-runtime', '.cache',
  'coverage', '.next', '.turbo', 'auth_info_baileys', 'logs', 'tmp', 'temp',
  'downloads', 'cache', 'dist', 'build', 'reports',
];
const TEST_FILE = /(?:\.test|[-_]test)\.(?:js|mjs|cjs)$/i;
const TEST_PREFIX = /^test[-_.].*\.(?:js|mjs|cjs)$/i;
const REPORT_DIRECTORY = path.join('data', 'test-reports');
const RUN_ID = () => `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(4).toString('hex')}`;

async function loadIgnoredDirectories(projectRoot) {
  const ignored = new Set(DEFAULT_IGNORED_DIRS);
  try {
    const content = await readFile(path.join(projectRoot, '.testignore'), 'utf8');
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('!')) continue;
      const normalized = line.replaceAll('\\', '/').replace(/^\/?/, '').replace(/\/$/, '');
      if (!normalized || normalized.includes('*') || normalized.includes('?')) continue;
      ignored.add(normalized.split('/').at(-1));
    }
  } catch {}
  return ignored;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export async function discoverTestFiles(projectRoot = process.cwd()) {
  const root = await realpath(path.resolve(projectRoot));
  const testRoot = path.join(root, 'test');
  const testRootInfo = await lstat(testRoot);
  if (!testRootInfo.isDirectory() || testRootInfo.isSymbolicLink()) {
    throw new Error('Direktori test/ wajib berupa direktori fisik, bukan symlink.');
  }
  const resolvedTestRoot = await realpath(testRoot);
  if (!isInside(root, resolvedTestRoot)) throw new Error('Direktori test/ berada di luar project root.');

  const files = [];
  const ignoredDirs = await loadIgnoredDirectories(root);
  const walk = async directory => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        await walk(path.join(directory, entry.name));
        continue;
      }
      if (!entry.isFile() || !(TEST_FILE.test(entry.name) || TEST_PREFIX.test(entry.name))) continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      const segments = relative.split(path.sep);
      if (segments.some(segment => ignoredDirs.has(segment))) continue;
      files.push(relative.split(path.sep).join('/'));
    }
  };
  await walk(resolvedTestRoot);
  return files.sort();
}

export function buildNodeTestArgs(files, forwardedArgs = []) {
  const allowedExact = new Set(['--experimental-test-coverage']);
  const allowedValueFlags = new Set([
    '--test-reporter', '--test-reporter-destination', '--test-name-pattern',
    '--test-skip-pattern', '--test-concurrency', '--test-timeout',
  ]);
  const safeArgs = [];
  for (let index = 0; index < forwardedArgs.length; index += 1) {
    const arg = String(forwardedArgs[index]);
    if (allowedExact.has(arg)) { safeArgs.push(arg); continue; }
    const equalsAt = arg.indexOf('=');
    const flag = equalsAt >= 0 ? arg.slice(0, equalsAt) : arg;
    if (!allowedValueFlags.has(flag)) {
      throw new Error(`Opsi npm test tidak diizinkan oleh runner terisolasi: ${arg}`);
    }
    if (equalsAt >= 0) {
      if (!arg.slice(equalsAt + 1)) throw new Error(`Nilai opsi ${flag} tidak boleh kosong.`);
      safeArgs.push(arg);
    } else {
      const value = forwardedArgs[index + 1];
      if (value === undefined || String(value).startsWith('--')) throw new Error(`Opsi ${flag} membutuhkan nilai.`);
      safeArgs.push(flag, String(value));
      index += 1;
    }
  }
  return ['--test', ...safeArgs, ...files];
}

function gitValue(projectRoot, args) {
  const result = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf8', timeout: 5000 });
  return result.status === 0 ? result.stdout.trim() : '';
}

function summarizeEvents(events, exitCode) {
  const summaryEvent = [...events].reverse().find(event => event.type === 'summary');
  if (summaryEvent?.counts) {
    return {
      tests: Number(summaryEvent.tests ?? summaryEvent.counts.completed ?? 0),
      passed: Number(summaryEvent.passed ?? summaryEvent.counts.passed ?? 0),
      failed: Number(summaryEvent.failed ?? summaryEvent.counts.failed ?? 0),
      skipped: Number(summaryEvent.skipped ?? summaryEvent.counts.skipped ?? 0),
      discovered: Number(summaryEvent.counts.discovered ?? 0),
      cancelled: 0,
    };
  }
  const passed = events.filter(event => event.type === 'pass').length;
  const failed = events.filter(event => event.type === 'fail').length;
  const skipped = events.filter(event => event.type === 'pass' && event.details?.skip).length;
  return { tests: passed + failed, passed, failed, skipped, discovered: events.filter(event => event.type === 'discovered').length, cancelled: exitCode === null ? 1 : 0 };
}

function safeRelativeFile(file, projectRoot) {
  const raw = String(file || '').replaceAll('\\', '/');
  if (!raw) return '';
  const absolute = path.isAbsolute(raw) ? raw : path.resolve(projectRoot, raw);
  const relative = path.relative(projectRoot, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return raw.split('/').at(-1) || raw;
  return relative.split(path.sep).join('/');
}

async function sourceExcerpt(projectRoot, file, line, radius = 7) {
  const relative = safeRelativeFile(file, projectRoot);
  if (!relative || !Number.isInteger(Number(line)) || Number(line) < 1) return null;
  const absolute = path.resolve(projectRoot, relative);
  if (!isInside(projectRoot, absolute)) return null;
  try {
    const source = await readFile(absolute, 'utf8');
    const rows = source.split(/\r?\n/);
    const focus = Number(line);
    const from = Math.max(1, focus - radius);
    const to = Math.min(rows.length, focus + radius);
    return {
      file: relative,
      focusLine: focus,
      fromLine: from,
      toLine: to,
      content: rows.slice(from - 1, to).map((row, index) => `${String(from + index).padStart(5, ' ')}${from + index === focus ? ' > ' : '   '}${redactText(row)}`).join('\n'),
    };
  } catch { return null; }
}

function redactStructured(value) {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactStructured);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, redactStructured(nested)]));
  }
  return value;
}

function stringifyError(error) {
  if (error === null || error === undefined) return 'Tidak ada detail error terstruktur dari Node Test Runner.';
  if (typeof error === 'string') return redactText(error);
  const parts = [];
  for (const key of ['name', 'message', 'code', 'failureType', 'operator', 'expected', 'actual', 'stack', 'cause']) {
    if (error[key] === undefined) continue;
    let value;
    try { value = typeof error[key] === 'string' ? error[key] : JSON.stringify(error[key], null, 2); }
    catch { value = String(error[key]); }
    if (value) parts.push(`${key}: ${redactText(value).slice(0, 24000)}`);
  }
  if (!parts.length) {
    try { return redactText(JSON.stringify(error, null, 2)).slice(0, 24000); }
    catch { return redactText(String(error)); }
  }
  return parts.join('\n');
}

function makeFailuresMarkdown(failures, excerpts, projectRoot) {
  if (!failures.length) return '# Detail kegagalan\n\nTidak ada test yang dilaporkan gagal oleh Node Test Runner.\n';
  const excerptByKey = new Map(excerpts.map(item => [`${item.file}:${item.focusLine}`, item]));
  const sections = ['# Detail kegagalan', '', `Total test gagal: **${failures.length}**`, ''];
  failures.forEach((event, index) => {
    const file = safeRelativeFile(event.file, projectRoot);
    sections.push(`## ${index + 1}. ${event.name || '(nama test tidak tersedia)'}`);
    sections.push('', `- File: \`${file || 'tidak diketahui'}\`${event.line ? `:${event.line}` : ''}${event.column ? `:${event.column}` : ''}`);
    if (event.durationMs !== null && event.durationMs !== undefined) sections.push(`- Durasi: ${Number(event.durationMs).toFixed(2)} ms`);
    sections.push('', '```text', stringifyError(event.error), '```', '');
    const excerpt = excerptByKey.get(`${file}:${Number(event.line)}`);
    if (excerpt) sections.push('Cuplikan source:', '', '```js', excerpt.content, '```', '');
  });
  return sections.join('\n');
}

async function writeReportArchive({ projectRoot, runId, startedAt, finishedAt, files = [], events = [], stdout = '', stderr = '', exitCode = 1, signal = '', preflightError = '' }) {
  const reportRoot = path.join(projectRoot, REPORT_DIRECTORY);
  await mkdir(reportRoot, { recursive: true });
  const summary = summarizeEvents(events, exitCode);
  const failures = events.filter(event => event.type === 'fail');
  const packageInfo = await readFile(path.join(projectRoot, 'package.json'), 'utf8').then(raw => JSON.parse(raw)).catch(() => ({}));
  const excerpts = [];
  for (const failure of failures) {
    const excerpt = await sourceExcerpt(projectRoot, failure.file, failure.line);
    if (excerpt) excerpts.push(excerpt);
  }

  const status = exitCode === 0 && !preflightError && summary.failed === 0 ? 'PASS' : 'FAIL';
  const metadata = {
    reportVersion: 1,
    runId,
    status,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
    command: 'npm test',
    package: { name: packageInfo.name || '', version: packageInfo.version || '', testScript: packageInfo.scripts?.test || '' },
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    git: { branch: gitValue(projectRoot, ['branch', '--show-current']), head: gitValue(projectRoot, ['rev-parse', 'HEAD']), shortHead: gitValue(projectRoot, ['rev-parse', '--short', 'HEAD']) },
    testFiles: files.length,
    discoveredTestFiles: files,
    counts: summary,
    exitCode,
    signal: signal || null,
    preflightError: preflightError ? redactText(preflightError) : null,
  };

  const lines = [
    '# Whiskay Bot — npm test report', '',
    `- Status: **${status}**`, `- Run ID: \`${runId}\``,
    `- Mulai: ${startedAt}`, `- Selesai: ${finishedAt}`,
    `- Durasi: ${(metadata.durationMs / 1000).toFixed(2)} detik`,
    `- Package: ${metadata.package.name || 'unknown'} ${metadata.package.version || ''}`,
    `- Node: ${process.version} · ${process.platform}/${process.arch}`,
    `- Git branch: ${metadata.git.branch || '(tidak diketahui)'}`,
    `- Git HEAD: ${metadata.git.shortHead || '(tidak tersedia)'}`,
    `- File test ditemukan: ${files.length}`,
    '', '## Ringkasan hasil', '',
    `| Metrik | Jumlah |`, '|---|---:|',
    `| Test selesai | ${summary.tests} |`, `| Lulus | ${summary.passed} |`,
    `| Gagal | ${summary.failed} |`, `| Skip | ${summary.skipped} |`,
    `| File test | ${files.length} |`, `| Exit code | ${exitCode ?? 'null'} |`,
    '', '## Cara memakai laporan', '',
    '1. Kirim ZIP ini tanpa mengekstrak atau mengubah isinya.',
    '2. Untuk tiap error, buka `failures.md` dan lihat nama test, file, baris, stack, expected/actual bila disediakan Node, serta cuplikan source.',
    '3. `events.jsonl` menyimpan event machine-readable per test; `logs/npm-test.stdout.log` menyimpan stream lengkap reporter.',
    '4. `discovered-tests.txt` berisi daftar semua file test yang dijalankan.',
    '', '## Batas verifikasi', '',
    'Laporan ini membuktikan hasil `npm test` pada source dan runtime saat laporan dibuat. Ini bukan bukti uji live WhatsApp, credential provider, koneksi GitHub remote, atau deployment produksi.',
  ];
  if (preflightError) lines.push('', '## Preflight error', '', '```text', redactText(preflightError), '```');
  if (failures.length) lines.push("", `## Failure count: ${failures.length}`, "", "Detail lengkap ada di failures.md.");

  const reportEntries = [
    { name: 'README-REPORT.md', data: lines.join('\n') + '\n' },
    { name: 'summary.json', data: JSON.stringify(metadata, null, 2) + '\n' },
    { name: 'discovered-tests.txt', data: files.join('\n') + (files.length ? '\n' : '') },
    { name: 'events.jsonl', data: events.map(event => JSON.stringify(redactStructured(event))).join('\n') + (events.length ? '\n' : '') },
    { name: 'failures.json', data: JSON.stringify(redactStructured(failures.map(event => ({ ...event, errorText: stringifyError(event.error) }))), null, 2) + '\n' },
    { name: 'failures.md', data: makeFailuresMarkdown(failures, excerpts, projectRoot) },
    { name: 'source-excerpts.json', data: JSON.stringify(excerpts, null, 2) + '\n' },
    { name: 'logs/npm-test.stdout.log', data: redactText(stdout) },
    { name: 'logs/npm-test.stderr.log', data: redactText(stderr) },
  ];

  const npmCiLog = process.env.WHISKAY_NPM_CI_LOG;
  if (npmCiLog) {
    const resolved = path.resolve(projectRoot, npmCiLog);
    if (isInside(projectRoot, resolved)) {
      try { reportEntries.push({ name: 'logs/npm-ci.log', data: redactText(await readFile(resolved, 'utf8')) }); } catch {}
    }
  }

  const filename = `npm-test-${runId}-${status.toLowerCase()}.zip`;
  const archivePath = path.join(reportRoot, filename);
  await writeFile(archivePath, createZipBuffer(reportEntries));
  await writeFile(path.join(reportRoot, 'LATEST.txt'), `${filename}\n${status}\n${finishedAt}\n`);
  return { archivePath, relativeArchivePath: path.relative(projectRoot, archivePath).split(path.sep).join('/'), status, summary, sizeBytes: (await readFile(archivePath)).length };
}

function printProgressLine(event) {
  if (event.type === 'pass' || event.type === 'fail') {
    const counts = event.counts || {};
    const completed = Number(counts.completed || 0);
    if (event.type === 'fail') {
      const file = safeRelativeFile(event.file, projectRoot);
      const message = event.error?.message || event.error?.name || 'test gagal';
      console.error(`[FAIL] ${event.name || '(unnamed)'} — ${file || '?'}${event.line ? `:${event.line}` : ''} — ${redactText(message).slice(0, 220)}`);
    } else if (completed === 1 || completed % 25 === 0) {
      console.log(`[TEST] ${completed} selesai · ${counts.passed || 0} lulus · ${counts.failed || 0} gagal`);
    }
  }
}

async function main() {
  const projectRoot = await realpath(process.cwd());
  const packageJson = path.join(projectRoot, 'package.json');
  const requirePackageJson = await readFile(packageJson, 'utf8');
  const packageInfo = JSON.parse(requirePackageJson);
  if (!packageInfo.scripts?.test) throw new Error('package.json tidak mendefinisikan scripts.test.');
  const files = await discoverTestFiles(projectRoot);
  if (!files.length) throw new Error('Tidak ditemukan file test *.test.js/*.test.mjs/*.test.cjs di direktori test/.');

  const runId = RUN_ID();
  const startedAt = new Date().toISOString();
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'whiskay-npm-test-'));
  const env = {
    ...process.env,
    CI: process.env.CI || '1',
    NODE_ENV: 'test',
    WHISKAY_TEST_MODE: '1',
    WHISKAY_DATA_DIR: path.join(runtimeRoot, 'data'),
    SESSION_DIR: path.join(runtimeRoot, 'sessions'),
    JADIBOT_DATA_DIR: path.join(runtimeRoot, 'jadibot'),
    TMPDIR: runtimeRoot,
    TMP: runtimeRoot,
    TEMP: runtimeRoot,
  };

  console.log(`WHISKAY npm test · ${files.length} file test · Node ${process.version}`);
  console.log('Isolasi runtime aktif; output detail disimpan ke ZIP agar terminal tetap ringkas.');
  console.log('Penyimpanan laporan: data/test-reports/');

  const forwarded = process.argv.slice(2);
  const nodeArgs = buildNodeTestArgs(files, forwarded);
  const customReporterProvided = forwarded.some(arg => String(arg).startsWith('--test-reporter'));
  if (!customReporterProvided) nodeArgs.splice(1, 0, '--test-reporter=./scripts/testcommand-reporter.mjs');

  const child = spawn(process.execPath, nodeArgs, {
    cwd: projectRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const events = [];
  let stdout = '';
  let stderr = '';
  let pendingLine = '';
  let spawnError = '';
  const onStdoutChunk = chunk => {
    const textChunk = chunk.toString();
    stdout += textChunk;
    pendingLine += textChunk;
    const rows = pendingLine.split(/\r?\n/);
    pendingLine = rows.pop() || '';
    for (const row of rows) {
      if (!row.trim()) continue;
      try {
        const event = JSON.parse(row);
        events.push(event);
        printProgressLine(event);
      } catch {
        // Preserve unrecognized reporter output in the full log; do not flood the terminal.
      }
    }
  };
  child.stdout.on('data', onStdoutChunk);
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });

  let exitCode = 1;
  let signal = '';
  try {
    const outcome = await new Promise(resolve => {
      child.once('error', error => { spawnError = error?.stack || error?.message || String(error); resolve({ code: 1, signal: '' }); });
      child.once('close', (code, killedBy) => resolve({ code: Number.isInteger(code) ? code : 1, signal: killedBy || '' }));
    });
    exitCode = outcome.code;
    signal = outcome.signal;
    if (pendingLine.trim()) {
      try { const event = JSON.parse(pendingLine); events.push(event); printProgressLine(event); }
      catch {}
    }
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }

  const finishedAt = new Date().toISOString();
  if (spawnError) stderr += `\n${spawnError}\n`;
  let report;
  try {
    report = await writeReportArchive({ projectRoot, runId, startedAt, finishedAt, files, events, stdout, stderr, exitCode, signal, preflightError: spawnError });
  } catch (error) {
    console.error(`Gagal membuat ZIP laporan: ${redactText(error?.stack || error?.message || String(error))}`);
  }

  const summary = report?.summary || summarizeEvents(events, exitCode);
  console.log('');
  console.log(`WHISKAY TEST RESULT: ${report?.status || (exitCode === 0 ? 'PASS (REPORT FAILED)' : 'FAIL (REPORT FAILED)')}`);
  console.log(`Test: ${summary.passed}/${summary.tests} lulus · ${summary.failed} gagal · ${summary.skipped} skip`);
  console.log(`File test: ${files.length} · Durasi: ${((new Date(finishedAt) - new Date(startedAt)) / 1000).toFixed(1)} detik · Exit: ${exitCode}`);
  if (report?.relativeArchivePath) console.log(`REPORT_ZIP=${report.relativeArchivePath}`);
  if (report?.relativeArchivePath) console.log(`REPORT_SIZE=${(report.sizeBytes / 1024).toFixed(1)} KiB`);
  if (summary.failed > 0) console.error(`Detail kegagalan: ${report?.relativeArchivePath || 'ZIP gagal dibuat'} (lihat failures.md di dalam ZIP).`);
  process.exitCode = exitCode;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) {
  // Capture the preflight/package errors as a ZIP too, when possible.
  main().catch(async error => {
    const message = error?.stack || error?.message || String(error);
    console.error(`WHISKAY TEST PREFLIGHT FAILED: ${redactText(message)}`);
    const projectRoot = path.resolve(process.cwd());
    const runId = RUN_ID();
    const now = new Date().toISOString();
    try {
      const report = await writeReportArchive({ projectRoot, runId, startedAt: now, finishedAt: now, preflightError: message, exitCode: 1 });
      console.error(`REPORT_ZIP=${report.relativeArchivePath}`);
    } catch (archiveError) {
      console.error(`Gagal membuat ZIP preflight: ${redactText(archiveError?.message || String(archiveError))}`);
    }
    process.exitCode = 1;
  });
}

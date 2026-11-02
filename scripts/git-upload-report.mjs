#!/usr/bin/env node
/** Build a redacted, timestamped Git upload report and local evidence ZIP. */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createZipBuffer, redactText, parseTestSummary, extractFailureLines, classifyFailure } from './testcommand-runner.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const index = arg.indexOf('=');
  return index < 0 ? [arg.replace(/^--/, ''), 'true'] : [arg.slice(2, index), arg.slice(index + 1)];
}));
const root = process.cwd();
const runId = args['run-id'] || `${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`;
const logDir = path.resolve(root, args['log-dir'] || 'data/test-reports/git-upload-current');
const qaStatus = (args['qa-status'] || 'UNKNOWN').toUpperCase();
const sourceBranch = args['source-branch'] || 'unknown';
const uploadBranch = args['upload-branch'] || 'unknown';
const baseBranch = args['base-branch'] || 'main';
const tracked = args.tracked === 'true';
const reportDir = path.join(root, 'docs', 'reports', 'git-upload');
const localDir = path.join(root, 'data', 'test-reports');

async function readLog(name) {
  try { return redactText(await readFile(path.join(logDir, name), 'utf8')); }
  catch { return ''; }
}
const logs = {
  'fetch.log': await readLog('fetch.log'),
  'preflight.log': await readLog('preflight.log'),
  'blocked-reason.log': await readLog('blocked-reason.log'),
  'analysis.log': await readLog('analysis.log'),
  'npm-ci.log': await readLog('npm-ci.log'),
  'syntax.log': await readLog('syntax.log'),
  'npm-test.log': await readLog('npm-test.log'),
  'qa-output.log': await readLog('qa-output.log'),
};
const testSummary = parseTestSummary(logs['npm-test.log']);
const allDiagnosticText = Object.values(logs).join('\n');
const detected = classifyFailure(allDiagnosticText);
const failures = extractFailureLines(allDiagnosticText);
const preflightStatus = /BLOCK|ERROR:|UPLOAD BLOCKED/i.test(logs['preflight.log'] + logs['analysis.log'])
  ? 'FAIL'
  : (logs['preflight.log'] || logs['analysis.log'] ? 'PASS' : 'NOT RUN');
const fetchStatus = /Fetch origin: PASS/i.test(logs['fetch.log']) ? 'PASS'
  : (/fetch gagal|fatal:|error:/i.test(logs['fetch.log']) ? 'WARNING' : 'NOT RUN');
const now = new Date();
const jakartaTime = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', weekday: 'long', year: 'numeric', month: 'long', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(now);
const status = qaStatus === 'PASS' ? 'PASS' : (qaStatus === 'BLOCKED' ? 'BLOCKED' : 'FAIL');
const gitHead = await (async () => {
  try {
    const { execFileSync } = await import('node:child_process');
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch { return 'unknown'; }
})();
const report = [
  '---',
  `run_id: ${runId}`,
  `qa_status: ${status}`,
  `base_branch: ${baseBranch}`,
  `upload_branch: ${uploadBranch}`,
  '---',
  '',
  `# Whiskay Git Upload Report — ${runId}`,
  '',
  `- **Waktu lokal:** ${jakartaTime} WIB (Asia/Jakarta)`,
  `- **Versi:** ${JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version}`,
  `- **Commit sumber:** ${gitHead}`,
  `- **Branch sumber:** ${sourceBranch}`,
  `- **Branch upload:** ${uploadBranch}`,
  `- **Target PR:** ${baseBranch}`,
  `- **Hasil QA lokal:** ${status}`,
  '',
  '## Ringkasan validasi',
  '',
  `| Tahap | Status |`,
  `|---|---|`,
  `| Fetch origin | ${fetchStatus} |`,
  `| Private-data preflight | ${preflightStatus} |`,
  `| npm ci | ${/NPM_CI_RESULT=(PASS|PASS_RETRY)/.exec(logs['qa-output.log'])?.[1] || 'FAIL / NOT RECORDED'} |`,
  `| Syntax check | ${/SYNTAX_RESULT=(PASS|FAIL)/.exec(logs['qa-output.log'])?.[1] || 'NOT RECORDED'} |`,
  `| npm test | ${/NPM_TEST_RESULT=(PASS|FAIL)/.exec(logs['qa-output.log'])?.[1] || 'NOT RECORDED'} |`,
  `| QA aggregate | ${status} |`,
  '',
  '## Ringkasan test',
  '',
  `- Test ditemukan/terhitung: ${testSummary.tests ?? 'tidak tersedia'}`,
  `- Lulus: ${testSummary.passed ?? 'tidak tersedia'}`,
  `- Gagal: ${testSummary.failed ?? 'tidak tersedia'}`,
  `- Skip: ${testSummary.skipped ?? 'tidak tersedia'}`,
  '',
  '## Deteksi masalah',
  '',
  detected
    ? `- **${detected.severity.toUpperCase()} — ${detected.code} (${detected.category})**\n- ${detected.explanation}\n- Tindakan: ${detected.recommendedAction}`
    : (status === 'PASS' ? '- Tidak ada pola kegagalan umum terdeteksi pada log lokal.' : '- QA gagal; lihat bagian error dan ZIP diagnostik untuk detail. Jenis kegagalan belum dapat diklasifikasikan otomatis.'),
  '',
  '## Error / bug yang terdeteksi',
  '',
  failures ? '```text\n' + failures + '\n```' : 'Tidak ada baris kegagalan terstruktur yang dapat diekstrak dari log.',
  '',
  '## Log dan arsip',
  '',
  `- ZIP diagnostik lengkap lokal: \`data/test-reports/git-upload-${runId}.zip\``,
  '- ZIP berisi log fetch, preflight/security audit, analisis, npm ci, syntax check, npm test, laporan ini, serta ZIP detail `npm test` bila tersedia; laporan hard-block tetap lokal dan konten teks diproses melalui redaksi credential.',
  '- Laporan ini tidak boleh berisi `.env`, database, sesi WhatsApp, token, private key, atau isi pesan pengguna.',
  '',
  '## Catatan validasi',
  '',
  '- QA lokal yang gagal tidak otomatis membatalkan upload branch; hasilnya tetap dilaporkan dalam Pull Request agar masalah bisa ditinjau.',
  '- Secret scan dan perlindungan database/session adalah hard-block: file sensitif tidak akan diunggah walaupun QA gagal.',
  '- GitHub Actions akan menjalankan CI ulang pada branch ini dan membuat/memperbarui GitHub Issue jika validasi gagal.',
  '- Tidak ada push langsung ke branch `main`; perubahan menunggu Pull Request.',
  '',
].join('\n');

await mkdir(localDir, { recursive: true });
const testArchives = [];
const testArchiveRelative = /REPORT_ZIP=([^\s]+\.zip)/.exec(logs['npm-test.log'])?.[1];
if (testArchiveRelative) {
  const fullPath = path.resolve(root, testArchiveRelative);
  const relativeToReports = path.relative(localDir, fullPath);
  if (relativeToReports && !relativeToReports.startsWith('..') && !path.isAbsolute(relativeToReports)) {
    try {
      const info = await stat(fullPath);
      if (info.isFile() && info.size <= 100 * 1024 * 1024) {
        testArchives.push({ name: `test-artifacts/${path.basename(fullPath)}`, data: await readFile(fullPath) });
      }
    } catch {}
  }
}
const zipEntries = [
  { name: 'README-REPORT.md', data: report },
  { name: 'meta/run.json', data: JSON.stringify({ runId, qaStatus: status, sourceBranch, uploadBranch, baseBranch, createdAt: now.toISOString(), createdAtJakarta: jakartaTime, fetchStatus, preflightStatus, testSummary, detectedFailure: detected, includedTestArchives: testArchives.map(item => item.name) }, null, 2) + '\n' },
  ...Object.entries(logs).filter(([, content]) => content).map(([name, data]) => ({ name: `logs/${name}`, data })),
  ...testArchives,
];
const zipPath = path.join(localDir, `git-upload-${runId}.zip`);
await writeFile(zipPath, createZipBuffer(zipEntries));
const localReport = path.join(localDir, `git-upload-${runId}.md`);
await writeFile(localReport, report);

let trackedReportPath = '';
if (tracked) {
  await mkdir(reportDir, { recursive: true });
  trackedReportPath = path.join(reportDir, `${runId}.md`);
  await writeFile(trackedReportPath, report);
}
console.log(`UPLOAD_REPORT_LOCAL=${path.relative(root, localReport).replaceAll('\\', '/')}`);
console.log(`UPLOAD_REPORT_ZIP=${path.relative(root, zipPath).replaceAll('\\', '/')}`);
if (trackedReportPath) console.log(`UPLOAD_REPORT_TRACKED=${path.relative(root, trackedReportPath).replaceAll('\\', '/')}`);
console.log(`UPLOAD_REPORT_STATUS=${status}`);

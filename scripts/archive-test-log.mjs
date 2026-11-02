#!/usr/bin/env node
// Produce a compact ZIP when dependency installation fails before npm test can run.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createZipBuffer, redactText } from './testcommand-runner.mjs';

const root = path.resolve(process.cwd());
const [rawLog = '', phase = 'qa', rawCode = '1'] = process.argv.slice(2);
if (!rawLog) {
  console.error('Usage: node scripts/archive-test-log.mjs <log-path> <phase> <exit-code>');
  process.exit(64);
}
const logPath = path.resolve(root, rawLog);
const relative = path.relative(root, logPath);
if (relative.startsWith('..') || path.isAbsolute(relative)) {
  console.error('Log path harus berada di dalam project root.');
  process.exit(65);
}
const content = redactText(await readFile(logPath, 'utf8'));
const reportDir = path.join(root, 'data', 'test-reports');
await mkdir(reportDir, { recursive: true });
const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`;
const exitCode = Number.parseInt(rawCode, 10) || 1;
const readme = [
  '# Whiskay QA — Dependency/Preflight Failure', '',
  `- Phase: ${phase}`, `- Run ID: ${runId}`, `- Time: ${new Date().toISOString()}`,
  `- Exit code: ${exitCode}`, `- Log source: ${relative}`, '',
  'Dependency installation stopped before the Node test suite could start.',
  'Attach this ZIP when reporting the failure. The complete redacted installer output is in `logs/phase.log`.',
].join('\n') + '\n';
const filename = `${phase}-failure-${runId}.zip`;
const archive = createZipBuffer([
  { name: 'README-REPORT.md', data: readme },
  { name: 'summary.json', data: JSON.stringify({ phase, runId, timestamp: new Date().toISOString(), exitCode, log: relative }, null, 2) + '\n' },
  { name: 'logs/phase.log', data: content },
]);
await writeFile(path.join(reportDir, filename), archive);
await writeFile(path.join(reportDir, 'LATEST.txt'), `${filename}\nFAIL\n${new Date().toISOString()}\n`);
console.log(`REPORT_ZIP=${path.posix.join('data/test-reports', filename)}`);

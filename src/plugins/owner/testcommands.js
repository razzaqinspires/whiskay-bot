import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { registry } from '../../core/registry.js';

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, 'data', 'test-reports');
const safeId = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
const timestamp = () => new Date().toISOString();
const commandRows = () => {
  const plugins = registry.plugins?.plugins instanceof Map ? [...registry.plugins.plugins.values()] : [];
  const seen = new Map();
  for (const plugin of plugins) {
    const commands = Array.isArray(plugin.menuCommands) ? plugin.menuCommands : Array.isArray(plugin.command) ? plugin.command : [plugin.command];
    for (const raw of commands) {
      const command = String(raw || '').trim().toLowerCase();
      if (command && !seen.has(command)) seen.set(command, { command, plugin: plugin.name || 'unknown', file: plugin.__file || '', ownerOnly: Boolean(plugin.owner) });
    }
  }
  return [...seen.values()].sort((a, b) => a.command.localeCompare(b.command));
};
async function runTests() {
  const started = Date.now();
  const commands = commandRows();
  const testDir = path.join(ROOT, 'test');
  const testFiles = [];
  const syntaxChecks = [];
  const { readdir } = await import('node:fs/promises');
  try {
    for (const name of await readdir(testDir)) if (name.endsWith('.test.js') || name.endsWith('.test.cjs')) testFiles.push(name);
  } catch {}
  // Syntax-check every first-party source file individually so failures name the exact file.
  const walkSources = async dir => {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walkSources(full);
      else if (/\.(?:js|cjs|mjs)$/.test(entry.name) && !full.includes(`${path.sep}node_modules${path.sep}`)) {
        try {
          await execFileAsync(process.execPath, ['--check', full], { cwd: ROOT, timeout: 10000, maxBuffer: 1024 * 1024 });
          syntaxChecks.push({ file: path.relative(ROOT, full), ok: true });
        } catch (error) {
          syntaxChecks.push({ file: path.relative(ROOT, full), ok: false, error: String(error.stderr || error.message || 'Syntax check failed').slice(0, 1000) });
        }
      }
    }
  };
  await walkSources(path.join(ROOT, 'src'));
  const syntaxFailures = syntaxChecks.filter(item => !item.ok);
  let testResult = { ok: false, stdout: '', stderr: '', code: null };
  try {
    const result = await execFileAsync(process.execPath, ['--test'], { cwd: ROOT, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
    testResult = { ok: true, stdout: result.stdout || '', stderr: result.stderr || '', code: 0 };
  } catch (error) {
    testResult = { ok: false, stdout: error.stdout || '', stderr: error.stderr || error.message || '', code: Number.isInteger(error.code) ? error.code : null, signal: error.signal || null };
  }
  const report = {
    id: `cmdtest-${Date.now().toString(36)}`,
    createdAt: timestamp(),
    durationMs: Date.now() - started,
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    commandCount: commands.length,
    commands,
    testFileCount: testFiles.length,
    testFiles,
    syntaxChecked: syntaxChecks.length,
    syntaxFailures,
    suite: testResult,
    note: 'Pengujian otomatis menguji test suite dan inventaris plugin; command bisnis tidak dieksekusi satu per satu karena dapat mengirim pesan, mengubah saldo/data, atau memicu aksi eksternal.'
  };
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(path.join(REPORT_DIR, `${report.id}.json`), JSON.stringify(report, null, 2), { mode: 0o600 });
  return report;
}
function summary(report) {
  const lines = [
    `ID: ${report.id}`,
    `Waktu: ${report.createdAt}`,
    `Durasi: ${(report.durationMs / 1000).toFixed(1)} detik`,
    `Node: ${report.node} · ${report.platform}`,
    `Command terdaftar: ${report.commandCount}`,
    `File test ditemukan: ${report.testFileCount}`,
    `Node test suite: ${report.suite.ok ? 'LULUS' : 'GAGAL'} (exit ${report.suite.code ?? 'unknown'})`,
    '',
    'Ringkasan command:',
    ...report.commands.slice(0, 45).map((item, i) => `${i + 1}. ${item.command}${item.ownerOnly ? ' [OWNER]' : ''} · ${item.plugin}`),
  ];
  if (report.commands.length > 45) lines.push(`… dan ${report.commands.length - 45} command lainnya.`);
  const output = `${report.suite.stdout || ''}\n${report.suite.stderr || ''}`.trim();
  if (report.syntaxFailures.length) lines.push('', 'ERROR SYNTAX:', ...report.syntaxFailures.map(x => `${x.file}: ${x.error}`));
  if (output) lines.push('', 'Log test suite (dipotong 4.000 karakter):', output.slice(-4000));
  lines.push('', report.note);
  return lines.join('\n').slice(0, 9000);
}
async function saveReport(id) {
  const clean = safeId(id);
  if (!clean) throw new Error('ID laporan tidak valid.');
  const reportPath = path.join(REPORT_DIR, `${clean}.json`);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const testFile = path.join(ROOT, 'test', `owner-command-audit-${clean}.test.js`);
  const escapedCommands = JSON.stringify(report.commands.map(x => x.command), null, 2);
  const testSource = `// Generated by .testcommands; inventory audit, not command execution.\nimport test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { existsSync, readdirSync } from 'node:fs';\nimport path from 'node:path';\nconst root = process.cwd();\nconst expectedCommands = ${escapedCommands};\ntest('owner command audit: expected plugin command inventory is non-empty', () => {\n  assert.ok(expectedCommands.length > 0, 'No commands were recorded in audit ${clean}');\n});\ntest('owner command audit: every command has a source plugin directory', () => {\n  assert.ok(existsSync(path.join(root, 'src', 'plugins')), 'src/plugins directory is missing');\n  const files = [];\n  const walk = dir => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (/\.(?:js|cjs|mjs)$/.test(entry.name)) files.push(full); } };\n  walk(path.join(root, 'src', 'plugins'));\n  assert.ok(files.length > 0, 'No plugin source files found');\n});\n`;
  await writeFile(testFile, testSource, 'utf8');
  const readmePath = path.join(ROOT, 'README.md');
  const marker = `<!-- OWNER-COMMAND-AUDIT:${clean} -->`;
  const section = `\n\n### Owner Command Tester · ${clean}\n\n- Waktu laporan: ${report.createdAt}\n- Command terdaftar: ${report.commandCount}\n- File test ditemukan saat audit: ${report.testFileCount}\n- Syntax check: ${report.syntaxChecked - report.syntaxFailures.length}/${report.syntaxChecked} lolos\n- Hasil \`node --test\`: **${report.suite.ok ? 'LULUS' : 'GAGAL'}** (exit ${report.suite.code ?? 'unknown'})\n- Durasi: ${(report.durationMs / 1000).toFixed(1)} detik\n- Skrip audit tersimpan: \`test/${path.basename(testFile)}\`\n- Catatan: command bisnis tidak dipanggil otomatis karena berpotensi mengirim pesan, memodifikasi data, atau melakukan transaksi.\n${marker}\n`;
  let readme = await readFile(readmePath, 'utf8');
  if (!readme.includes(marker)) await appendFile(readmePath, section, 'utf8');
  return { report, testFile: path.relative(ROOT, testFile) };
}
export default {
  name: 'owner-command-tester',
  command: ['testcommands', 'testcmds'],
  menuCommands: ['testcommands'],
  description: 'Owner-only: audit inventaris command dan jalankan test suite',
  category: 'owner',
  owner: true,
  cooldown: 5000,
  async execute(ctx) {
    if (!ctx.isOwner) return ctx.sendInteractive({ title: 'Akses Ditolak', body: 'Perintah ini khusus owner.', buttons: [{ name: 'quick_reply', title: 'Kembali', id: `${ctx.prefix}menu` }] });
    const [action = '', id = ''] = ctx.args || [];
    if (action === 'save') {
      try {
        const saved = await saveReport(id);
        return ctx.sendInteractive({ title: 'Hasil Testing Disimpan', subtitle: saved.testFile, body: `Skrip audit disimpan dan README.md diperbarui.\nCommand terdaftar: ${saved.report.commandCount}\nHasil test suite: ${saved.report.suite.ok ? 'LULUS' : 'GAGAL'}`, buttons: [{ name: 'quick_reply', title: 'Jalankan Tes Lagi', id: `${ctx.prefix}testcommands` }, { name: 'quick_reply', title: 'Lihat Menu', id: `${ctx.prefix}menu` }] });
      } catch (error) {
        return ctx.sendInteractive({ title: 'Gagal Menyimpan Hasil', body: String(error?.message || error), buttons: [{ name: 'quick_reply', title: 'Coba Lagi', id: `${ctx.prefix}testcommands` }] });
      }
    }
    if (action === 'discard') {
      return ctx.sendInteractive({ title: 'Laporan Tidak Disimpan', body: 'Laporan sementara ini tidak ditambahkan ke test/*.js dan README.md tetap tidak berubah. Laporan sementara akan dikelola terpisah.', buttons: [{ name: 'quick_reply', title: 'Jalankan Tes Lagi', id: `${ctx.prefix}testcommands` }, { name: 'quick_reply', title: 'Menu', id: `${ctx.prefix}menu` }] });
    }
    const report = await runTests();
    const detail = summary(report);
    return ctx.sendInteractive({
      title: `Command Test · ${report.suite.ok ? 'LULUS' : 'PERLU DICEK'}`,
      subtitle: `${report.commandCount} command · ${(report.durationMs / 1000).toFixed(1)} detik`,
      body: `${detail}\n\nSimpan hasil audit ini ke test/*.test.js dan perbarui README.md?`,
      buttons: [
        { name: 'quick_reply', title: 'Simpan & Update README', id: `${ctx.prefix}testcommands save ${report.id}` },
        { name: 'quick_reply', title: 'Jangan Simpan', id: `${ctx.prefix}testcommands discard ${report.id}` }
      ]
    });
  }
};

import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { registry } from '../../core/registry.js';
import { formatRunSummary, runRepositoryVerification } from '../../../scripts/testcommand-runner.mjs';

const ROOT = process.cwd();
const SUCCESS_REPORT = path.join(ROOT, 'test', 'reports', 'WHISKAY-VERIFY-SUCCESS.md');
const DIAGNOSTIC_DIR = path.join(ROOT, 'test', 'reports', 'diagnostics');
const COMMANDS = ['testcommands', 'testcommand', 'testcmd', 'testcmds'];

function commandRows() {
  const pluginManager = registry.plugins;
  const plugins = pluginManager?.plugins instanceof Map ? [...pluginManager.plugins.values()] : [];
  const seen = new Map();
  for (const plugin of plugins) {
    const asList = value => Array.isArray(value) ? value : value ? [value] : [];
    const commands = [...new Set([
      ...asList(plugin.command),
      ...asList(plugin.aliases),
      ...asList(plugin.menuCommands),
    ])];
    for (const raw of commands) {
      const command = String(raw || '').trim().toLowerCase();
      if (command && !seen.has(command)) seen.set(command, {
        command,
        plugin: plugin.name || 'unknown',
        file: plugin.__file || '',
        ownerOnly: Boolean(plugin.owner),
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.command.localeCompare(b.command));
}

async function sendText(ctx, message) {
  const body = String(message ?? '');
  let lastError;
  if (typeof ctx.reply === 'function') {
    try { return await ctx.reply(body); } catch (error) { lastError = error; }
  }
  if (typeof ctx.send === 'function') {
    try { return await ctx.send({ text: body }); } catch (error) { lastError = error; }
  }
  if (typeof ctx.sendInteractive === 'function') {
    try { return await ctx.sendInteractive({ title: 'Whiskay Testcommand', body, buttons: [] }); }
    catch (error) { lastError = error; }
  }
  if (lastError) throw lastError;
  throw new TypeError('Tidak tersedia helper reply/send pada context WhatsApp.');
}

async function sendInteractive(ctx, payload) {
  if (typeof ctx.sendInteractive === 'function') {
    try { return await ctx.sendInteractive(payload); } catch {}
  }
  return sendText(ctx, [payload.title, payload.subtitle, payload.body].filter(Boolean).join('\n\n'));
}

function helpText(prefix) {
  return [
    '🧪 WHISKAY BOT · FULL QA CONTROL CENTER',
    '━━━━━━━━━━━━━━━━━━━━',
    'TUJUAN',
    'Menjalankan pemeriksaan repository pada sandbox sementara. QA tidak menjalankan command WhatsApp dan tidak menyentuh database/session produksi. Proses berjalan senyap; gunakan status untuk polling manual.',
    '',
    'PERINTAH UTAMA',
    `${prefix}testcommands run — mulai full verification secara senyap.`,
    `${prefix}testcommands status / progress — status run aktif, hitungan test, laporan sukses, dan ZIP kegagalan terakhir.`,
    `${prefix}testcommands report — baca laporan sukses terakhir.`,
    `${prefix}testcommands download — kirim ZIP diagnostik terakhir sebagai dokumen WhatsApp.`,
    `${prefix}testcommands help — tampilkan panduan ini.`,
    '',
    'URUTAN PIPELINE',
    '1. Preflight: validasi package.json, package-lock.json, dan script yang diperlukan.',
    '2. npm ci: instalasi dependency bersih di workspace sementara.',
    '3. Syntax audit: pemeriksaan sintaks dengan progres file selesai/lulus/gagal.',
    '4. npm run verify:all: seluruh release gate Stage; progres TAP dihitung dari hasil test yang selesai.',
    '5. npm test: hanya menemukan file test di test/ melalui scripts/run-tests.mjs; .testignore mengecualikan sessions/, node_modules/, symlink, dan folder runtime. Reporter event Node.js menampilkan test ditemukan, selesai, lulus, dan gagal secara langsung.',
    '6. Report: satu laporan sukses saat semua tahap lulus; ZIP diagnostik jika ada kegagalan.',
    '',
    'OUTPUT',
    'Sukses: test/reports/WHISKAY-VERIFY-SUCCESS.md',
    'Gagal: test/reports/diagnostics/WHISKAY-VERIFY-FAILURE-<run-id>.zip',
    'ZIP diagnostik memuat manifest, log per tahap, exit code, stack/error, lokasi file:line:column bila dapat diparse, dan cuplikan source yang sudah disanitasi.',
    '',
    'KEAMANAN & KONTROL',
    '• Owner-only; run kedua ditolak selama QA aktif. Worker QA tidak mengirim notifikasi otomatis.',
    '• npm ci dijalankan di salinan sementara; node_modules bot aktif tidak diganti.',
    '• npm test tidak melakukan discovery di root repository: hanya file test di test/ yang dipilih secara eksplisit. sessions/ tidak dibaca sebagai target test dan seluruh state test diarahkan ke temp OS.',
    '• node_modules/ dikecualikan dari discovery, audit source, dan salinan sandbox. Node hanya membacanya sebagai dependency resolver saat import; test tidak menjalankan install/uninstall di folder tersebut.',
    '• Aturan pengecualian terpusat di .testignore dan ditegakkan oleh scripts/run-tests.mjs; symlink test tidak diikuti.',
    '• .env, .npmrc, sesi WhatsApp, dan database runtime tidak dimasukkan ke ZIP.',
    '• Bot tetap dapat menerima command lain selama QA berlangsung.',
    '• ZIP diagnostik hanya dikirim setelah owner meminta .testcommands download.',
    '• QA berjalan senyap: worker tidak mengirim progress, pesan tahap, atau pesan hasil otomatis. Status hanya dikirim ketika owner meminta .testcommands status.',
    '• Total test yang ditemukan dapat bertambah selama discovery; angka final dan denominator pasti dikunci setelah test runner selesai.',
    '• Error sesi/pre-key Baileys diklasifikasikan terpisah; runner tidak membuat pre-key palsu atau menghapus sessions/.',
    '• Kegagalan registry/DNS dicatat sebagai kegagalan instalasi, bukan dianggap tes lulus.',
    '',
    'ALIAS',
    `${prefix}testcommand · ${prefix}testcmd · ${prefix}testcmds`,
    'Akses: owner saja. Gunakan tombol di bawah untuk menjalankan aksi tanpa mengetik ulang.',
  ].join('\n');
}

function actionButtons(prefix, mode = 'help') {
  if (mode === 'report') return [
    { name: 'quick_reply', title: 'Status QA', id: `${prefix}testcommands status` },
    { name: 'quick_reply', title: 'Jalankan QA', id: `${prefix}testcommands run` },
    { name: 'quick_reply', title: 'Panduan', id: `${prefix}testcommands help` },
  ];
  if (mode === 'status') return [
    { name: 'quick_reply', title: '🔄 Refresh Status', id: `${prefix}testcommands status` },
    { name: 'quick_reply', title: '📦 Kirim ZIP Diagnostik', id: `${prefix}testcommands download` },
    { name: 'quick_reply', title: '📄 Laporan QA', id: `${prefix}testcommands report` },
  ];
  if (mode === 'running') return [
    { name: 'quick_reply', title: 'Lihat Status', id: `${prefix}testcommands status` },
    { name: 'quick_reply', title: 'Panduan QA', id: `${prefix}testcommands help` },
  ];
  return [
    { name: 'quick_reply', title: '▶️ Mulai Full QA', id: `${prefix}testcommands run` },
    { name: 'quick_reply', title: '📊 Status QA', id: `${prefix}testcommands status` },
    { name: 'quick_reply', title: '📄 Laporan Sukses', id: `${prefix}testcommands report` },
  ];
}

export function createTestCommandsPlugin({
  runVerification = runRepositoryVerification,
  readText = readFile,
  readDirectory = readdir,
  getStat = lstat,
  projectRoot = ROOT,
} = {}) {
  let activeRun = null;
  let lastRunState = null;
  let lastReport = null;

  async function latestStatus() {
    let success = null;
    let failures = [];
    try { success = await getStat(path.join(projectRoot, 'test', 'reports', 'WHISKAY-VERIFY-SUCCESS.md')); } catch {}
    try {
      failures = (await readDirectory(path.join(projectRoot, 'test', 'reports', 'diagnostics')))
        .filter(name => /^WHISKAY-VERIFY-FAILURE-.*\.zip$/i.test(name))
        .sort()
        .reverse();
    } catch {}
    const visibleRun = activeRun || lastRunState;
    const activeDetails = visibleRun
      ? `Run: ${visibleRun.id}\nStatus: ${visibleRun.status || (activeRun ? 'RUNNING' : 'UNKNOWN')}\nDimulai: ${new Date(visibleRun.startedAt).toISOString()}\n${visibleRun.finishedAt ? `Selesai: ${new Date(visibleRun.finishedAt).toISOString()}\n` : ''}Tahap: ${visibleRun.step || 'inisialisasi'}\nProgres test: ${visibleRun.progress ? `${visibleRun.progress.completed || 0} selesai · ${visibleRun.progress.passed || 0} lulus · ${visibleRun.progress.failed || 0} gagal · ${visibleRun.progress.discovered || 0} ditemukan` : 'belum memasuki tahap test'}${visibleRun.error ? `\nError: ${visibleRun.error}` : ''}`
      : 'Belum ada eksekusi QA pada proses bot ini.';
    const successText = activeRun
      ? 'Laporan final run aktif belum tersedia; hasil sukses dari run sebelumnya disembunyikan sampai run ini selesai.'
      : success
        ? `Laporan sukses terakhir: test/reports/WHISKAY-VERIFY-SUCCESS.md (diubah ${success.mtime.toISOString()})`
        : 'Belum ada laporan sukses penuh.';
    const latestFailure = activeRun
      ? 'ZIP diagnostik run aktif belum tersedia; arsip dari run sebelumnya tidak ditampilkan.'
      : failures[0]
        ? `ZIP diagnostik terakhir: test/reports/diagnostics/${failures[0]}`
        : 'Belum ada ZIP diagnostik kegagalan.';
    const lastRun = !activeRun && lastReport ? `Eksekusi terakhir pada proses ini: ${lastReport.id} · ${lastReport.status}` : '';
    const lastCounters = !activeRun && lastReport ? lastReport.steps.filter(step => step.summary?.tests !== null && step.summary?.tests !== undefined).map(step => `${step.name}: ${step.summary.passed ?? 0}/${step.summary.tests} lulus · ${step.summary.failed ?? 0} gagal`).join('\n') : '';
    const lastSyntax = !activeRun && lastReport?.syntax ? `Syntax terakhir: ${lastReport.syntax.checked - lastReport.syntax.failed}/${lastReport.syntax.checked} file lulus` : '';
    return [
      '━━━━━━━━━━━━━━━━━━━━',
      activeDetails,
      successText,
      latestFailure,
      `Jumlah ZIP diagnostik tersimpan: ${failures.length}`,
      lastRun,
      lastSyntax,
      lastCounters,
      '',
      'Gunakan tombol di bawah untuk memperbarui status atau membuka laporan.',
    ].filter(Boolean).join('\n');
  }

  async function sendHelp(ctx, prefix) {
    return sendInteractive(ctx, {
      title: '🧪 WHISKAY FULL QA CONTROL CENTER',
      subtitle: 'Owner-only · Isolated verification · Diagnostic reports',
      body: helpText(prefix),
      footer: 'Pilih aksi melalui tombol WhatsApp.',
      buttons: actionButtons(prefix, 'help'),
    });
  }

  async function sendStatus(ctx, prefix) {
    return sendInteractive(ctx, {
      title: '📊 WHISKAY QA STATUS',
      subtitle: activeRun ? `Run aktif: ${activeRun.id}` : 'Tidak ada run aktif',
      body: await latestStatus(),
      buttons: actionButtons(prefix, activeRun ? 'running' : 'status'),
    });
  }

  async function sendLatestDiagnostic(ctx, prefix) {
    let files = [];
    try {
      files = (await readDirectory(path.join(projectRoot, 'test', 'reports', 'diagnostics')))
        .filter(name => /^WHISKAY-VERIFY-FAILURE-.*\.zip$/i.test(name)).sort().reverse();
    } catch {}
    if (!files.length) return sendInteractive(ctx, {
      title: '📦 ZIP DIAGNOSTIK TIDAK DITEMUKAN',
      body: 'Belum ada arsip kegagalan yang tersimpan. Jalankan Full QA terlebih dahulu.',
      buttons: actionButtons(prefix, 'help'),
    });
    const fileName = files[0];
    const filePath = path.join(projectRoot, 'test', 'reports', 'diagnostics', fileName);
    const info = await getStat(filePath);
    if (!info.isFile() || info.size <= 0 || info.size > 25 * 1024 * 1024) {
      return sendInteractive(ctx, {
        title: '⚠️ ARSIP TIDAK DAPAT DIKIRIM',
        body: `Arsip ${fileName} kosong atau melebihi batas pengiriman 25 MiB. Lokasi lokal: test/reports/diagnostics/${fileName}`,
        buttons: actionButtons(prefix, 'status'),
      });
    }
    if (typeof ctx.sock?.sendMessage !== 'function' || !ctx.chat) {
      return sendInteractive(ctx, { title: '⚠️ TRANSPORT DOKUMEN TIDAK TERSEDIA', body: 'Socket Baileys atau chat tujuan tidak tersedia pada context ini.', buttons: actionButtons(prefix, 'status') });
    }
    const rawBuffer = await readText(filePath);
    const buffer = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer);
    if (!buffer.length || buffer.length > 25 * 1024 * 1024) {
      return sendInteractive(ctx, { title: '⚠️ UKURAN ARSIP BERUBAH', body: 'File berubah setelah pemeriksaan awal atau melewati batas 25 MiB. Tidak ada dokumen yang dikirim.', buttons: actionButtons(prefix, 'status') });
    }
    try {
      await ctx.sock.sendMessage(ctx.chat, {
        document: buffer,
        mimetype: 'application/zip',
        fileName,
        caption: `📦 WHISKAY QA DIAGNOSTIC\nRun terakhir: ${fileName.replace(/^WHISKAY-VERIFY-FAILURE-|\.zip$/g, '')}\nUkuran: ${(buffer.length / 1024).toFixed(1)} KiB\nArsip ini berisi log, stack, lokasi file/baris/kolom, dan cuplikan source yang telah disanitasi.`,
      }, ctx.raw?.key ? { quoted: ctx.raw } : {});
    } catch (error) {
      return sendInteractive(ctx, { title: '❌ PENGIRIMAN ZIP GAGAL', body: `Baileys gagal mengirim ${fileName}: ${String(error?.message || error).slice(0, 220)}\nCoba tombol kirim ulang setelah koneksi pulih.`, buttons: [{ name: 'quick_reply', title: '🔁 Kirim Ulang ZIP', id: `${prefix}testcommands download` }, ...actionButtons(prefix, 'status').slice(0, 2)] });
    }
    return sendInteractive(ctx, {
      title: '✅ ZIP DIAGNOSTIK TERKIRIM',
      body: `File ${fileName} sudah dikirim sebagai dokumen.`,
      buttons: actionButtons(prefix, 'status'),
    });
  }

  async function runInBackground(runState) {
    try {
      const report = await runVerification({
        projectRoot,
        onProgress: event => {
          if (event.id) runState.id = event.id;
          if (event.type === 'step-start') runState.step = event.step;
          if (event.type === 'syntax-progress') {
            runState.step = 'node-check';
            runState.progress = { completed: event.completed, discovered: event.total, passed: event.passed, failed: event.failed };
          }
          if (event.type === 'test-discovery') {
            runState.step = 'npm-test';
            runState.progress = { completed: 0, discovered: event.files, passed: 0, failed: 0 };
            runState.discovery = { files: event.files, ignored: event.ignored || [], isolated: Boolean(event.isolated) };
          }
          if (event.type === 'test-progress') {
            runState.step = event.step || 'npm-test';
            runState.progress = { ...(event.counts || {}) };
          }
          if (event.type === 'step-complete') {
            runState.step = `${event.step} selesai`;
            runState.lastStep = { name: event.step, ok: Boolean(event.ok), exitCode: event.exitCode ?? null, summary: event.summary || null, classification: event.classification || null };
          }
        },
      });
      lastReport = report;
      runState.status = report.status || 'UNKNOWN';
      runState.report = report;
      runState.step = 'selesai';
    } catch (error) {
      runState.status = 'ERROR';
      runState.error = String(error?.message || error).slice(0, 1000);
    } finally {
      runState.finishedAt = Date.now();
      if (activeRun === runState) activeRun = null;
      lastRunState = runState;
    }
  }

  return {
    name: 'owner-command-tester',
    command: COMMANDS,
    menuCommands: ['testcommands'],
    description: 'Owner-only: silent background verification; manual status/report/diagnostic requests only',
    category: 'owner',
    owner: true,
    energyMode: 'free',
    energyCost: 0,
    cooldown: 0,
    skipCooldown: true,
    async execute(ctx) {
      const prefix = ctx.prefix || '.';
      if (!ctx.isOwner) return sendInteractive(ctx, {
        title: '🔒 AKSES DIBATASI',
        body: 'Control Center Testcommand hanya tersedia untuk owner bot.',
        buttons: [{ name: 'quick_reply', title: '🏠 Menu Utama', id: `${prefix}menu` }],
      });
      const [rawAction = 'help'] = Array.isArray(ctx.args) ? ctx.args : [];
      const action = String(rawAction || 'help').trim().toLowerCase();

      if (action === 'help') return sendHelp(ctx, prefix);
      if (action === 'status' || action === 'progress') return sendStatus(ctx, prefix);
      if (action === 'report') {
        if (activeRun) return sendInteractive(ctx, {
          title: '⏳ QA MASIH BERJALAN',
          subtitle: `Run ${activeRun.id}`,
          body: 'Laporan final belum tersedia untuk run aktif. Gunakan .testcommands status untuk melihat progres. Tidak ada hasil dari run sebelumnya yang ditampilkan sebagai hasil run ini.',
          buttons: actionButtons(prefix, 'running'),
        });
        try {
          const report = await readText(path.join(projectRoot, 'test', 'reports', 'WHISKAY-VERIFY-SUCCESS.md'), 'utf8');
          return sendInteractive(ctx, {
            title: '📄 WHISKAY · LAPORAN SUKSES',
            subtitle: 'Laporan verification terakhir',
            body: String(report).slice(0, 8500),
            buttons: actionButtons(prefix, 'report'),
          });
        } catch {
          return sendInteractive(ctx, {
            title: '📄 LAPORAN BELUM TERSEDIA',
            body: `${await latestStatus()}\n\nBelum ada laporan sukses penuh. Jika run terakhir gagal, gunakan tombol Kirim ZIP Diagnostik untuk menerima arsip langsung.`,
            buttons: actionButtons(prefix, 'status'),
          });
        }
      }
      if (['download', 'zip', 'diagnostic'].includes(action)) {
        if (activeRun) return sendInteractive(ctx, {
          title: '⏳ QA MASIH BERJALAN',
          subtitle: `Run ${activeRun.id}`,
          body: 'ZIP diagnostik final belum tersedia untuk run aktif. Gunakan .testcommands status dan minta download setelah proses selesai.',
          buttons: actionButtons(prefix, 'running'),
        });
        return sendLatestDiagnostic(ctx, prefix);
      }
      if (!['run', 'start'].includes(action)) {
        return sendInteractive(ctx, { title: '⚠️ SUBPERINTAH TIDAK DIKENAL', body: `Input: ${action}\n\n${helpText(prefix)}`, buttons: actionButtons(prefix, 'help') });
      }
      // QA run/start is intentionally silent, including duplicate requests while a run is active.
      // The owner must explicitly request `.testcommands status` to receive a WhatsApp message.
      ctx.suppressPostCommandXp = true;
      if (activeRun) return;

      // Suppress generic post-command XP/level-up notifications as well as QA progress.
      const inventory = commandRows();
      const runState = { id: `QA-${Date.now().toString(36).toUpperCase()}`, startedAt: Date.now(), status: 'RUNNING', step: 'inisialisasi', progress: null, commandInventory: inventory.length };
      activeRun = runState;
      // Deliberately silent: the QA worker never emits progress or completion messages.
      // The owner polls .testcommands status and requests report/download explicitly.
      runState.promise = runInBackground(runState);
      return;
    },
  };
}

export default createTestCommandsPlugin();

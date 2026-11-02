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
    'Menjalankan pemeriksaan repository secara menyeluruh pada sandbox sementara. QA tidak mengeksekusi semua command WhatsApp satu per satu dan tidak menyentuh database/session produksi.',
    '',
    'PERINTAH UTAMA',
    `${prefix}testcommands run — mulai full verification.`,
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
    '• Owner-only; run kedua ditolak selama QA aktif.',
    '• npm ci dijalankan di salinan sementara; node_modules bot aktif tidak diganti.',
    '• npm test tidak melakukan discovery di root repository: hanya file test di test/ yang dipilih secara eksplisit. sessions/ tidak dibaca sebagai target test dan seluruh state test diarahkan ke temp OS.',
    '• node_modules/ dikecualikan dari discovery, audit source, dan salinan sandbox. Node hanya membacanya sebagai dependency resolver saat import; test tidak menjalankan install/uninstall di folder tersebut.',
    '• Aturan pengecualian terpusat di .testignore dan ditegakkan oleh scripts/run-tests.mjs; symlink test tidak diikuti.',
    '• .env, .npmrc, sesi WhatsApp, dan database runtime tidak dimasukkan ke ZIP.',
    '• Bot tetap dapat menerima command lain selama QA berlangsung.',
    '• Tombol Kirim ZIP Diagnostik mengirim arsip .zip langsung ke chat owner sebagai dokumen WhatsApp.',
    '• Progres dikirim saat test pertama selesai, setiap 5 test, dan langsung saat ada kegagalan; status tetap dapat diperiksa dengan tombol Refresh.',
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
    const activeDetails = activeRun
      ? `Dimulai: ${new Date(activeRun.startedAt).toISOString()}\nTahap aktif: ${activeRun.step || 'inisialisasi'}\nProgres test: ${activeRun.progress ? `${activeRun.progress.completed} selesai · ${activeRun.progress.passed} lulus · ${activeRun.progress.failed} gagal · ${activeRun.progress.discovered} ditemukan` : 'belum memasuki tahap test'}`
      : '';
    const successText = success
      ? `Laporan sukses terakhir: test/reports/WHISKAY-VERIFY-SUCCESS.md (diubah ${success.mtime.toISOString()})`
      : 'Belum ada laporan sukses penuh.';
    const latestFailure = failures[0]
      ? `ZIP diagnostik terakhir: test/reports/diagnostics/${failures[0]}`
      : 'Belum ada ZIP diagnostik kegagalan.';
    const lastRun = lastReport ? `Eksekusi terakhir pada proses ini: ${lastReport.id} · ${lastReport.status}` : '';
    const lastCounters = lastReport ? lastReport.steps.filter(step => step.summary?.tests !== null && step.summary?.tests !== undefined).map(step => `${step.name}: ${step.summary.passed ?? 0}/${step.summary.tests} lulus · ${step.summary.failed ?? 0} gagal`).join('\n') : '';
    const lastSyntax = lastReport?.syntax ? `Syntax terakhir: ${lastReport.syntax.checked - lastReport.syntax.failed}/${lastReport.syntax.checked} file lulus` : '';
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
      buttons: actionButtons(prefix, 'status'),
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

  async function finishRun(ctx, report, inventoryCount, prefix) {
    const summary = formatRunSummary(report, projectRoot);
    const title = report.status === 'SUCCESS' ? '✅ FULL TEST LULUS' : '❌ FULL TEST GAGAL';
    const buttons = report.status === 'SUCCESS'
      ? [
          { name: 'quick_reply', title: 'Lihat Laporan Sukses', id: `${prefix}testcommands report` },
          { name: 'quick_reply', title: 'Status QA', id: `${prefix}testcommands status` },
        ]
      : [
          { name: 'quick_reply', title: '📦 Kirim ZIP Diagnostik', id: `${prefix}testcommands download` },
          { name: 'quick_reply', title: '📊 Status & Lokasi ZIP', id: `${prefix}testcommands status` },
          { name: 'quick_reply', title: '🧭 Bantuan', id: `${prefix}testcommands help` },
        ];
    await sendInteractive(ctx, {
      title,
      subtitle: `Run ${report.id} · ${inventoryCount} command terdaftar`,
      body: summary,
      buttons,
    });
  }

  async function runInBackground(ctx, prefix, inventoryCount, runState) {
    try {
      const report = await runVerification({
        projectRoot,
        onProgress: event => {
          if (event.id) runState.id = event.id;
          if (event.type === 'step-start') {
            runState.step = event.step;
            const label = event.step === 'npm-ci' ? 'Instalasi dependency (npm ci)'
              : event.step === 'verify-all' ? 'Menjalankan seluruh release gate (verify:all)'
                : event.step === 'npm-test' ? 'Menjalankan seluruh test discovery (npm test)'
                  : event.message;
            Promise.resolve(sendInteractive(ctx, { title: `⏳ ${label}`, subtitle: `Run ${runState.id}`, body: 'Tahap berjalan di sandbox sementara. Gunakan Refresh Status untuk melihat tahap aktif; hasil akhir baru dinyatakan setelah semua gate selesai.', buttons: actionButtons(prefix, 'running') })).catch(() => {});
            return;
          }
          if (event.type === 'syntax-progress') {
            runState.progress = { completed: event.completed, discovered: event.total, passed: event.passed, failed: event.failed };
            Promise.resolve(sendInteractive(ctx, {
              title: event.failed ? '⚠️ SYNTAX AUDIT MENEMUKAN ERROR' : '🔎 SYNTAX AUDIT PROGRESS',
              subtitle: `Run ${runState.id}`,
              body: `File diperiksa: ${event.completed}/${event.total}\nLulus: ${event.passed}\nGagal: ${event.failed}\n\nStatus: ${event.completed >= event.total ? 'PEMERIKSAAN FILE SELESAI' : 'MASIH BERJALAN'}\n${event.latest?.file || ''}`,
              buttons: actionButtons(prefix, 'running'),
            })).catch(() => {});
            return;
          }
          if (event.type === 'test-discovery') {
            runState.progress = { completed: 0, discovered: event.files, passed: 0, failed: 0 };
            Promise.resolve(sendInteractive(ctx, {
              title: '🧭 TEST DISCOVERY SELESAI',
              subtitle: `Run ${runState.id} · ${event.files} file test`,
              body: `Validasi test selesai.\nFile test yang dipilih: ${event.files}\nRoot discovery: test/\nPengecualian: ${(event.ignored || []).join(', ')}\nIsolasi direktori runtime: ${event.isolated ? 'AKTIF' : 'TIDAK AKTIF'}\n\nStatus: TEST BELUM SELESAI — proses masih berjalan.`,
              buttons: actionButtons(prefix, 'running'),
            })).catch(() => {});
            return;
          }
          if (event.type === 'test-progress') {
            runState.progress = event.counts;
            const counts = event.counts || {};
            const latest = event.latest?.name ? `\nTerakhir: ${event.latest.name}` : '';
            const isFailure = event.latest?.type === 'fail';
            const discoveredNow = Math.max(counts.discovered || 0, counts.completed || 0);
            const body = [
              discoveredNow > 0 ? `Selesai: ${counts.completed || 0}/${discoveredNow} ditemukan (sementara)` : `Selesai: ${counts.completed || 0} test`,
              `Lulus: ${counts.passed || 0}`, `Gagal: ${counts.failed || 0}`,
              discoveredNow > 0 ? `Total ditemukan sementara: ${discoveredNow}` : 'Total test: dihitung oleh test runner; angka final muncul setelah discovery selesai.',
              discoveredNow > 0 ? `Masih berjalan/menunggu: ${Math.max(0, discoveredNow - (counts.completed || 0))}` : 'Test selesai dihitung secara live; denominator final belum tersedia pada reporter tahap ini.',
              '', 'Status: PROSES MASIH BERJALAN. Jangan kumpulkan versi sebelum pesan FULL TEST LULUS muncul.', latest,
            ].join('\n');
            Promise.resolve(sendInteractive(ctx, { title: isFailure ? '⚠️ QA MENEMUKAN TEST GAGAL' : '🔄 QA PROGRESS UPDATE', subtitle: `${event.step} · Run ${runState.id}`, body, buttons: actionButtons(prefix, 'running') })).catch(() => {});
            return;
          }
          if (event.type === 'step-complete') {
            runState.step = `${event.step} selesai`;
            const summary = event.summary;
            const summaryText = summary ? `\nTest: ${summary.tests ?? '—'} · Lulus: ${summary.passed ?? '—'} · Gagal: ${summary.failed ?? '—'}` : '';
            const categoryText = event.classification ? `\nKategori: ${event.classification.category} (${event.classification.code})` : '';
            Promise.resolve(sendInteractive(ctx, { title: event.ok ? '✅ TAHAP QA SELESAI' : '❌ TAHAP QA GAGAL', subtitle: `${event.step} · Run ${runState.id}`, body: `Exit code: ${event.exitCode ?? 'unknown'}${summaryText}${categoryText}\n\n${event.ok ? 'Lanjut ke tahap berikutnya.' : 'Pipeline tetap melanjutkan tahap berikutnya untuk mengumpulkan diagnosis lengkap.'}`, buttons: actionButtons(prefix, 'running') })).catch(() => {});
          }
        },
      });
      lastReport = report;
      await finishRun(ctx, report, inventoryCount, prefix);
    } catch (error) {
      const message = String(error?.stack || error?.message || error).slice(0, 2600);
      try { await sendInteractive(ctx, { title: '❌ TEST RUNNER ERROR', subtitle: `Run ${runState.id}`, body: `${message}\n\nPeriksa folder test/reports/diagnostics.`, buttons: [{ name: 'quick_reply', title: '📦 Kirim ZIP Diagnostik', id: `${prefix}testcommands download` }, ...actionButtons(prefix, 'status').slice(0, 2)] }); } catch {}
    } finally {
      if (activeRun === runState) activeRun = null;
    }
  }

  return {
    name: 'owner-command-tester',
    command: COMMANDS,
    menuCommands: ['testcommands'],
    description: 'Owner-only: isolated npm ci, complete verification, async progress, success report and failure ZIP diagnostics',
    category: 'owner',
    owner: true,
    energyMode: 'free',
    energyCost: 0,
    cooldown: 2500,
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
      if (['download', 'zip', 'diagnostic'].includes(action)) return sendLatestDiagnostic(ctx, prefix);
      if (!['run', 'start'].includes(action)) {
        return sendInteractive(ctx, { title: '⚠️ SUBPERINTAH TIDAK DIKENAL', body: `Input: ${action}\n\n${helpText(prefix)}`, buttons: actionButtons(prefix, 'help') });
      }
      if (activeRun) {
        return sendInteractive(ctx, { title: '⏳ QA SEDANG BERJALAN', subtitle: activeRun.id, body: `Mulai: ${new Date(activeRun.startedAt).toISOString()}\nRun duplikat ditolak agar tidak terjadi instalasi atau verifikasi paralel.`, buttons: actionButtons(prefix, 'running') });
      }

      const inventory = commandRows();
      const runState = { id: `QA-${Date.now().toString(36).toUpperCase()}`, startedAt: Date.now(), step: 'inisialisasi', progress: null };
      activeRun = runState;
      try {
        await sendInteractive(ctx, {
          title: '🧪 WHISKAY FULL VERIFICATION DIMULAI',
          subtitle: `Run ${runState.id} · ${inventory.length} command terdaftar`,
          body: [
            'Pipeline berjalan di background; bot tetap menerima command lain.',
            '',
            '1. Preflight dependency dan konfigurasi',
            '2. npm ci pada sandbox sementara',
            '3. Audit sintaks JavaScript',
            '4. npm run verify:all (seluruh release gate)',
            '5. npm test (test discovery)',
            '6. Buat laporan sukses atau ZIP diagnostik otomatis',
            '',
            'Data live, sesi WhatsApp, .env, dan node_modules aktif tidak disentuh.',
          ].join('\n'),
          buttons: actionButtons(prefix, 'running'),
        });
      } catch (error) {
        activeRun = null;
        throw error;
      }
      runState.promise = runInBackground(ctx, prefix, inventory.length, runState);
      return;
    },
  };
}

export default createTestCommandsPlugin();

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const approvals = new Map();
const APPROVAL_TTL = 20 * 60 * 1000;
const MAX_APPROVALS = 40;

function rememberApproval(data) {
  const now = Date.now();
  for (const [token, item] of approvals) if (item.expiresAt <= now) approvals.delete(token);
  while (approvals.size >= MAX_APPROVALS) approvals.delete(approvals.keys().next().value);
  const token = randomBytes(5).toString('hex');
  approvals.set(token, { ...data, token, expiresAt: now + APPROVAL_TTL });
  return token;
}

function readApproval(token, ctx) {
  const row = approvals.get(String(token || '').toLowerCase());
  if (!row || row.expiresAt <= Date.now()) { approvals.delete(String(token || '').toLowerCase()); return null; }
  if (row.sender !== String(ctx.sender || '') || row.chat !== String(ctx.chat || '')) return null;
  return row;
}

function runScript(args, { timeoutMs = 180000 } = {}) {
  return new Promise(resolve => {
    const child = spawn('bash', ['scripts/auto-push.sh', ...args], { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', settled = false;
    const append = (current, chunk) => (current + chunk.toString()).slice(-24000);
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => { child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 3000).unref?.(); finish(124, 'Process dihentikan karena melewati batas waktu.'); }, timeoutMs);
    timer.unref?.();
    const finish = (code, error = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: Number.isInteger(code) ? code : 1, stdout, stderr, error });
    };
    child.once('error', error => finish(1, error.message));
    child.once('close', code => finish(code ?? 1));
  });
}

function outputText(result) {
  const chunks = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  const safe = chunks.replace(/(gh[pousr]_[A-Za-z0-9]{12})[A-Za-z0-9]+/g, '$1…').slice(-12500);
  return `${result.error ? `⚠️ ${result.error}\n` : ''}${safe || '(Tidak ada output)'}\n\nExit code: ${result.code}`;
}
function parseFingerprint(output) { return String(output || '').match(/APPROVAL_FINGERPRINT=([a-f0-9]{64})/i)?.[1] || ''; }

export default {
  name: 'github-push-control-center',
  command: ['gitpush', 'ghpush', 'githubpush', 'autopush'],
  category: 'owner',
  owner: true,
  cooldown: 2500,
  description: 'GitHub release control center: analyse → QA → explicit commit & push',
  async execute(ctx) {
    const [action = 'home', token = ''] = ctx.args || [];
    const task = String(action).toLowerCase();

    if (task === 'home' || task === 'help') {
      return ctx.sendInteractive({
        title: '🐙 WHISKAY · GITHUB CONTROL CENTER',
        subtitle: 'Review-first repository deployment',
        body: [
          'Alur wajib: ① Analisis repository → ② QA/syntax test → ③ Persetujuan tombol Commit & Push.',
          '',
          'Analisis mencakup branch/remote, file berubah, diff, commit lokal, .env exposure, CI push target, versi host, dan resolusi Cloudflared.',
          'QA menjalankan syntax-check semua JS/MJS/CJS serta npm test. Push hanya dibuka jika QA lulus dan fingerprint perubahan tetap sama.',
          '',
          'Proteksi: hanya owner, token persetujuan terikat ke sender + chat, kedaluwarsa 20 menit, secret scan, tanpa reset --hard / auto-stash / auto-rebase.'
        ].join('\n'),
        buttons: [
          { name: 'quick_reply', title: '🔍 Analisis Repository', id: '.gitpush analyze' },
          { name: 'quick_reply', title: '📋 Petunjuk', id: '.gitpush help' }
        ]
      });
    }

    if (task === 'analyze' || task === 'analysis' || task === 'audit' || task === 'status') {
      await ctx.reply('🔍 Menjalankan analisis read-only repository. Tidak ada commit atau push pada tahap ini.');
      const result = await runScript(['--analyze'], { timeoutMs: 45000 });
      const fingerprint = parseFingerprint(result.stdout + result.stderr);
      const body = outputText(result);
      if (result.code !== 0 || !fingerprint) {
        return ctx.sendInteractive({ title: '🔍 GitHub · Analysis Report', body: `${body}\n\nApproval belum dibuat. Perbaiki masalah lalu analisis ulang.`, buttons: [{ name: 'quick_reply', title: 'Analisis Ulang', id: '.gitpush analyze' }] });
      }
      const approval = rememberApproval({ sender: String(ctx.sender || ''), chat: String(ctx.chat || ''), fingerprint, qaPassed: false });
      return ctx.sendInteractive({
        title: '🔍 GITHUB · REPOSITORY ANALYSIS',
        subtitle: `Read-only · Ref ${approval.slice(0, 5)}`,
        body: `${body}\n\nAnalisis selesai. Belum ada perubahan Git yang dibuat. Jalankan QA agar tombol push dapat dibuka. Token approval: ${approval}`,
        buttons: [
          { name: 'quick_reply', title: '🧪 Jalankan QA', id: `.gitpush qa ${approval}` },
          { name: 'quick_reply', title: '🔄 Analisis Ulang', id: '.gitpush analyze' },
          { name: 'quick_reply', title: 'Dashboard GitHub', id: '.gitpush' }
        ]
      });
    }

    if (task === 'qa' || task === 'test') {
      const approval = readApproval(token, ctx);
      if (!approval) return ctx.reply('⛔ Token approval tidak valid, kedaluwarsa, atau bukan milik sesi owner/chat ini. Jalankan .gitpush analyze.');
      await ctx.reply('🧪 QA berjalan: pemeriksaan sintaks seluruh JS/MJS/CJS dan npm test. Push belum dijalankan.');
      const result = await runScript(['--qa'], { timeoutMs: 240000 });
      const fingerprint = parseFingerprint(result.stdout + result.stderr);
      if (result.code !== 0 || !String(result.stdout).includes('QA_RESULT=PASS')) {
        approval.qaPassed = false;
        return ctx.sendInteractive({ title: '🧪 GITHUB · QA FAILED', body: `${outputText(result)}\n\nCommit & Push dikunci. Perbaiki kegagalan lalu lakukan analisis + QA ulang.`, buttons: [{ name: 'quick_reply', title: 'Analisis Ulang', id: '.gitpush analyze' }, { name: 'quick_reply', title: 'Lihat Status', id: '.gitpush status' }] });
      }
      if (!fingerprint || fingerprint !== approval.fingerprint) {
        approvals.delete(approval.token);
        return ctx.sendInteractive({ title: '⚠️ Perubahan Berubah Saat QA', body: 'Fingerprint setelah test berbeda dari hasil analisis. Approval lama dibatalkan untuk mencegah upload perubahan yang belum ditinjau. Jalankan analisis ulang.', buttons: [{ name: 'quick_reply', title: 'Analisis Ulang', id: '.gitpush analyze' }] });
      }
      approval.qaPassed = true;
      return ctx.sendInteractive({
        title: '✅ GITHUB · QA PASSED',
        body: `${outputText(result)}\n\nQA lulus dan repository tidak berubah sejak analisis. Tekan tombol Commit & Push hanya setelah memeriksa laporan di atas. Approval terikat pada akun owner dan chat ini.`,
        buttons: [
          { name: 'quick_reply', title: '🚀 Commit & Push', id: `.gitpush confirm ${approval.token}` },
          { name: 'quick_reply', title: 'Batalkan Approval', id: `.gitpush cancel ${approval.token}` }
        ]
      });
    }

    if (task === 'cancel') {
      const approval = readApproval(token, ctx);
      if (!approval) return ctx.reply('Token tidak aktif atau bukan milik sesi ini.');
      approvals.delete(approval.token);
      return ctx.reply('🧹 Approval GitHub dibatalkan. Tidak ada commit atau push yang dilakukan.');
    }

    if (task === 'confirm' || task === 'push') {
      const approval = readApproval(token, ctx);
      if (!approval || !approval.qaPassed) return ctx.reply('⛔ Push memerlukan approval aktif dan QA yang lulus. Mulai lagi dengan .gitpush analyze.');
      await ctx.reply('🚀 Persetujuan diterima. Menjalankan preflight ulang, secret scan, commit dan push ke origin/main.');
      const result = await runScript(['--push', `--expected-fingerprint=${approval.fingerprint}`], { timeoutMs: 180000 });
      approvals.delete(approval.token);
      return ctx.sendInteractive({
        title: result.code === 0 && String(result.stdout).includes('PUSH_RESULT=SUCCESS') ? '✅ GITHUB PUSH BERHASIL' : '⚠️ GITHUB PUSH BELUM BERHASIL',
        body: outputText(result),
        buttons: [
          { name: 'quick_reply', title: 'Analisis Status Terbaru', id: '.gitpush analyze' },
          { name: 'quick_reply', title: 'Buka GitHub Repository', id: '.gitpush repo' }
        ]
      });
    }

    if (task === 'repo') {
      return ctx.sendInteractive({ title: '🐙 Whiskay Bot Repository', body: 'Repository utama: razzaqinspires/whiskay-bot', buttons: [{ name: 'cta_url', title: 'Buka GitHub', url: 'https://github.com/razzaqinspires/whiskay-bot' }, { name: 'quick_reply', title: 'Analisis Repository', id: '.gitpush analyze' }] });
    }

    return ctx.reply('Gunakan .gitpush | .gitpush analyze | .gitpush qa TOKEN | .gitpush confirm TOKEN | .gitpush cancel TOKEN.');
  }
};

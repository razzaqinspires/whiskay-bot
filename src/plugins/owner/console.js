import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import util from 'node:util';

const execFileAsync = promisify(execFile);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const MAX_OUTPUT = 12000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SOURCE_EXTS = new Set(['.js','.mjs','.cjs','.ts','.tsx','.jsx','.jsonc','.html','.css','.scss','.md','.txt','.yml','.yaml','.toml','.sh','.py','.sql','.xml','.svg','.vue','.svelte']);
const SKIP_DIRS = new Set(['node_modules','.git','.hg','.svn','.next','.nuxt','.turbo','dist','build','coverage','sessions','logs','tmp','temp','vendor','__pycache__','.venv','venv']);
const SKIP_EXTS = new Set(['.json','.dat','.env','.pem','.key','.p12','.pfx','.sqlite','.db','.log','.lock','.map','.wasm','.bin','.zip','.gz','.png','.jpg','.jpeg','.webp','.mp3','.mp4','.pdf']);
const scanCache = new Map();

function clip(value, limit = MAX_OUTPUT) {
  const s = typeof value === 'string' ? value : util.inspect(value, { depth: 4, maxArrayLength: 100, breakLength: 110 });
  return s.length > limit ? `${s.slice(0, limit)}\n… output dipotong (${s.length.toLocaleString('id-ID')} karakter total)` : s;
}
function parseFilters(raw) {
  const match = String(raw).match(/-f\s*\(([\s\S]*?)\)/);
  if (!match) return null;
  const terms = [...new Set(match[1].split(',').map(x => x.trim()).filter(Boolean))];
  return terms.length ? terms : null;
}
function safeRel(root, file) { return path.relative(root, file).split(path.sep).join('/'); }
async function scanSource(terms) {
  const started = performance.now();
  const root = path.resolve(process.env.SOURCE_DIR || '.');
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) throw new Error(`Direktori source tidak ditemukan: ${root}`);
  const results = [];
  let scannedFiles = 0, scannedChars = 0, skippedFiles = 0;
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name.toLowerCase())) continue;
        await walk(full); continue;
      }
      if (!entry.isFile() || entry.name.startsWith('.')) { skippedFiles++; continue; }
      const ext = path.extname(entry.name).toLowerCase();
      if (!SOURCE_EXTS.has(ext) || SKIP_EXTS.has(ext)) { skippedFiles++; continue; }
      const info = await stat(full).catch(() => null);
      if (!info || info.size > MAX_FILE_BYTES) { skippedFiles++; continue; }
      let source;
      try { source = await readFile(full, 'utf8'); } catch { skippedFiles++; continue; }
      if (source.includes('\u0000')) { skippedFiles++; continue; }
      scannedFiles++; scannedChars += source.length;
      const lines = source.split(/\r?\n/);
      const hits = [];
      for (let i = 0; i < lines.length; i++) {
        const found = terms.filter(term => lines[i].toLowerCase().includes(term.toLowerCase()));
        if (found.length) hits.push({ line: i + 1, terms: found, text: lines[i].trim().slice(0, 360) });
      }
      if (hits.length) results.push({ path: full, rel: safeRel(root, full), bytes: info.size, chars: source.length, lines: lines.length, hits, source });
    }
  }
  await walk(root);
  results.sort((a,b) => b.hits.length - a.hits.length || a.rel.localeCompare(b.rel));
  const elapsedMs = performance.now() - started;
  return { root, terms, results, scannedFiles, scannedChars, skippedFiles, elapsedMs };
}
function filterReport(scan, id) {
  const totalHits = scan.results.reduce((n, f) => n + f.hits.length, 0);
  const hitTerms = scan.terms.map(term => `${term}: ${scan.results.reduce((n,f) => n + f.hits.filter(h => h.terms.some(t => t.toLowerCase() === term.toLowerCase())).length, 0)} baris`).join('\n');
  const top = scan.results.slice(0, 30).map((f,i) => `${i+1}. ${f.rel}\n   ${f.hits.length} baris cocok · ${f.chars.toLocaleString('id-ID')} karakter · ${f.bytes.toLocaleString('id-ID')} byte`).join('\n');
  return `SOURCE SCAN · ${id}\nStatus: selesai\nRoot: ${scan.root}\nKata kunci: ${scan.terms.join(' | ')}\n\nRingkasan\n• Berkas dipindai: ${scan.scannedFiles.toLocaleString('id-ID')}\n• Berkas cocok: ${scan.results.length.toLocaleString('id-ID')}\n• Baris cocok: ${totalHits.toLocaleString('id-ID')}\n• Karakter source dipindai: ${scan.scannedChars.toLocaleString('id-ID')}\n• Berkas dilewati: ${scan.skippedFiles.toLocaleString('id-ID')}\n• Waktu: ${scan.elapsedMs.toFixed(1)} ms\n\nKecocokan per istilah\n${hitTerms}\n\nLokasi (maks. 30 ditampilkan)\n${top || 'Tidak ada kecocokan.'}\n\nPilih detail: .consolef open ${id} NOMOR\nContoh: .consolef open ${id} 1`;
}
async function sendSourceChunk(ctx, file, termInput) {
  const terms = String(termInput).split(',').map(x => x.trim()).filter(Boolean);
  const lines = file.source.split(/\r?\n/);
  const hitLines = file.hits.filter(h => h.terms.some(t => terms.some(term => t.toLowerCase() === term.toLowerCase())));
  const chunks = hitLines.slice(0, 25).map(h => {
    const start = Math.max(0, h.line - 4), end = Math.min(lines.length, h.line + 3);
    return `--- ${file.rel}:${h.line} ---\n${lines.slice(start, end).map((line,i) => `${start+i+1}: ${line}`).join('\n')}`;
  });
  return ctx.reply(clip(`Potongan kode · istilah: ${terms.join(', ')}\n${chunks.join('\n\n') || 'Tidak ada potongan.'}`, 12000));
}
export default {
  name: 'owner-console', command: ['console','consolef'], category: 'owner', owner: true, cooldown: 1000,
  description: 'Konsol owner: async eval, shell exec, Python dan source filter',
  async execute(ctx) {
    const mode = ctx.consoleMode || 'command';
    const raw = ctx.text || '';
    if (mode === 'exec') {
      if (!raw) return ctx.reply('Pemakaian: $ <perintah shell>\nAkses owner-only. Perintah berjalan pada direktori kerja bot.');
      const { stdout, stderr } = await execFileAsync('/bin/sh', ['-lc', raw], { timeout: 15000, maxBuffer: 1024 * 1024, cwd: process.cwd(), windowsHide: true });
      return ctx.reply(clip([stdout && `STDOUT\n${stdout}`, stderr && `STDERR\n${stderr}`, '(tanpa output)'].filter(Boolean).join('\n\n')));
    }
    if (mode === 'python') {
      if (!raw) return ctx.reply('Pemakaian: >> print("hello")\nPython dijalankan sebagai subprocess, timeout 15 detik.');
      const py = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
      const { stdout, stderr } = await execFileAsync(py, ['-c', raw], { timeout: 15000, maxBuffer: 1024 * 1024, cwd: process.cwd(), windowsHide: true });
      return ctx.reply(clip([stdout && `STDOUT\n${stdout}`, stderr && `STDERR\n${stderr}`, '(tanpa output)'].filter(Boolean).join('\n\n')));
    }
    if (mode === 'eval' || mode === 'return') {
      const filters = parseFilters(raw);
      if (filters) {
        const scan = await scanSource(filters);
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
        scanCache.set(id, scan);
        if (scanCache.size > 12) scanCache.delete(scanCache.keys().next().value);
        return ctx.reply(filterReport(scan, id));
      }
      const code = raw.replace(/^\s*--\s*/, '');
      if (!code) return ctx.reply('Konsol owner-only\n> kode async\n=> kode async dengan hasil return\n$ perintah shell\n>> kode Python\nContoh filter: > return -f(sendMessage, const dungeon)');
      const sock = ctx.sock || ctx.client || null;
      const m = ctx.m || ctx.message || ctx;
      const sendMessage = async (jid, content, options = {}) => {
        if (!sock?.sendMessage) throw new Error('sock.sendMessage tidak tersedia pada konteks ini');
        return sock.sendMessage(jid || ctx.chat, content, options);
      };
      const reply = (...args) => ctx.reply(...args);
      const fn = new AsyncFunction(
        'ctx', 'm', 'sock', 'util', 'process', 'sendMessage', 'reply',
        `"use strict"; ${mode === 'return' ? 'return (' + code.replace(/;\s*$/, '') + ')' : code}`
      );
      const result = await fn(ctx, m, sock, util, process, sendMessage, reply);
      if (result === undefined) return ctx.reply(`${mode === 'return' ? '=>' : 'OK'}\n(undefined)`);
      if (result && typeof result === 'object' && typeof result.then === 'function') {
        return ctx.reply(`${mode === 'return' ? '=>' : 'OK'}\n${clip(await result)}`);
      }
      return ctx.reply(`${mode === 'return' ? '=>' : 'OK'}\n${clip(result)}`);
    }
    const args = ctx.args || [];
    if (args[0] === 'open') {
      const id = args[1], n = Number(args[2]);
      const scan = scanCache.get(id);
      if (!scan || !Number.isInteger(n) || n < 1 || n > scan.results.length) return ctx.reply('Hasil scan tidak ditemukan/kedaluwarsa. Jalankan ulang: > return -f(kata1, kata2)');
      const file = scan.results[n-1];
      const body = `Path: ${file.rel}\nUkuran: ${file.bytes.toLocaleString('id-ID')} byte · ${file.chars.toLocaleString('id-ID')} karakter · ${file.lines.toLocaleString('id-ID')} baris\nKecocokan: ${file.hits.length} baris\n\nBaris cocok:\n${file.hits.slice(0,35).map(h => `${h.line}: [${h.terms.join(', ')}] ${h.text}`).join('\n')}\n\nJika tombol tidak tampil, gunakan perintah teks:\nPotongan: .consolef chunk ${id} ${n} ISTILAH\nKirim file: .consolef file ${id} ${n}`;
      return ctx.sendInteractive({ title: `Source Inspector · ${n}/${scan.results.length}`, subtitle: file.rel, body, footer: 'Pilih aksi; hasil filter tersimpan sementara sampai bot restart.', buttons: [
        { name: 'quick_reply', title: 'Ambil Potongan Kode', id: `.consolef chunk ${id} ${n} ${scan.terms.join(',')}` },
        { name: 'quick_reply', title: 'Kirim Berkas Source', id: `.consolef file ${id} ${n}` }
      ] });
    }
    if (args[0] === 'chunk') {
      const scan = scanCache.get(args[1]), n = Number(args[2]), term = args.slice(3).join(' ');
      if (!scan?.results[n-1] || !term) return ctx.reply('Format: .consolef chunk ID NOMOR ISTILAH');
      return sendSourceChunk(ctx, scan.results[n-1], term);
    }
    if (args[0] === 'file') {
      const scan = scanCache.get(args[1]), n = Number(args[2]), file = scan?.results[n-1];
      if (!file) return ctx.reply('Hasil scan tidak ditemukan/kedaluwarsa. Jalankan ulang filter.');
      const { writeFile: write } = await import('node:fs/promises');
      const out = path.join(os.tmpdir(), `whiskay-source-${Date.now()}-${path.basename(file.path)}`);
      await write(out, file.source, 'utf8');
      try { return await ctx.send({ document: await readFile(out), mimetype: 'text/plain', fileName: path.basename(file.path) }); }
      finally { await import('node:fs/promises').then(fs => fs.unlink(out)).catch(() => {}); }
    }
    return ctx.reply('Gunakan: .consolef open ID NOMOR | .consolef chunk ID NOMOR ISTILAH | .consolef file ID NOMOR');
  }
};

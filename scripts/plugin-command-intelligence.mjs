#!/usr/bin/env node
/** Stage 55: static plugin/command intelligence. Heuristic findings are advisory, never auto-delete plugins. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_ROOT = path.join(ROOT, 'src/plugins');
const SKIP = new Set(['node_modules', 'data', 'sessions', 'session', '.git']);
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory() && !SKIP.has(ent.name)) walk(path.join(dir, ent.name), out);
    else if (ent.isFile() && /\.(?:js|mjs|cjs)$/.test(ent.name)) out.push(path.join(dir, ent.name));
  }
  return out;
}
function values(raw) {
  if (!raw) return [];
  const array = raw.match(/^\s*\[([\s\S]*?)\]/);
  const body = array ? array[1] : raw.trim().replace(/^['"]|['"]$/g, '');
  return [...body.matchAll(/['"]([a-zA-Z0-9_.:-]+)['"]/g)].map(m => m[1].toLowerCase());
}
const files = walk(PLUGIN_ROOT).sort();
const registry = new Map();
const findings = [];
let pluginFiles = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  if (!/\bcommand\s*:/.test(text)) continue;
  pluginFiles++;
  const rel = path.relative(ROOT, file);
  const commandMatch = text.match(/\bcommand\s*:\s*(\[[\s\S]*?\]|['"][^'"]+['"])/);
  const aliasMatch = text.match(/\baliases?\s*:\s*(\[[\s\S]*?\]|['"][^'"]+['"])/);
  const commands = [...new Set([...values(commandMatch?.[1]), ...values(aliasMatch?.[1])])];
  if (!commands.length) findings.push({ severity: 'warning', code: 'COMMAND_METADATA_UNPARSED', file: rel, message: 'Metadata command/alias tidak dapat dibaca secara statis; periksa manual.' });
  if (!/\bexecute\s*[:(]/.test(text) && !/\bhandler\s*[:(]/.test(text)) findings.push({ severity: 'warning', code: 'HANDLER_NOT_DETECTED', file: rel, message: 'Tidak ditemukan execute/handler dengan pola statis; mungkin memakai factory atau export dinamis.' });
  for (const command of commands) {
    if (!registry.has(command)) registry.set(command, []);
    registry.get(command).push(rel);
  }
}
for (const [command, owners] of registry) {
  const unique = [...new Set(owners)];
  if (unique.length > 1) findings.push({ severity: 'warning', code: 'DUPLICATE_COMMAND_CANDIDATE', command, files: unique, message: `Command/alias "${command}" dideklarasikan di beberapa plugin. Validasi urutan registrasi dan intent sebelum mengubah.` });
}
const summary = {
  stage: 55,
  generatedAt: new Date().toISOString(),
  pluginFiles,
  commandNames: registry.size,
  duplicateCandidates: findings.filter(x => x.code === 'DUPLICATE_COMMAND_CANDIDATE').length,
  findings,
  status: 'PASS_WITH_ADVISORIES',
  note: 'Analisis statis bersifat heuristik. Tidak menghapus, menonaktifkan, atau mengubah plugin secara otomatis.'
};
const json = `${JSON.stringify(summary, null, 2)}\n`;
const md = [
  '# Stage 55 — Plugin & Command Intelligence', '',
  `- Generated: ${summary.generatedAt}`,
  `- Plugin files: ${pluginFiles}`,
  `- Command/alias names detected: ${registry.size}`,
  `- Duplicate candidates: ${summary.duplicateCandidates}`,
  `- Findings: ${findings.length}`, '',
  '## Findings', '',
  ...(findings.length ? findings.map((f, i) => `${i + 1}. **${f.severity.toUpperCase()} · ${f.code}** — ${f.message}${f.command ? ` Files: ${f.files.join(', ')}` : ` (${f.file})`}`) : ['No findings.']), '',
  '> Static heuristic only. Review candidates before changing plugin behavior.'
].join('\n');
const outJson = process.argv.find(x => x.startsWith('--json='));
const outMd = process.argv.find(x => x.startsWith('--markdown='));
if (outJson) fs.writeFileSync(path.resolve(ROOT, outJson.slice(7)), json);
if (outMd) fs.writeFileSync(path.resolve(ROOT, outMd.slice(11)), `${md}\n`);
console.log(`Plugin command intelligence: ${summary.status}`);
console.log(`Plugin files scanned: ${pluginFiles}`);
console.log(`Command/alias names: ${registry.size}`);
console.log(`Duplicate candidates: ${summary.duplicateCandidates}`);
console.log(`Advisory findings: ${findings.length}`);
if (findings.length) for (const f of findings) console.log(`${f.severity.toUpperCase()} ${f.code} ${f.command || f.file}: ${f.message}`);

#!/usr/bin/env node
/**
 * Stage 53 guard: remove private/runtime files from the Git index without
 * deleting the operator's local bytes. Every data/, sessions/ and session/ directory plus WhatsApp auth stores is
 * private; static, shareable game data belongs under assets/ instead.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runGit = args => execFileSync('git', args, { cwd: PROJECT_ROOT, encoding: 'utf8' });

function isPrivatePath(file) {
  const normalized = String(file).replaceAll('\\', '/');
  const parts = normalized.split('/');
  const base = parts.at(-1) || '';
  const localOnlyDirectories = new Set([
    'data', 'sessions', 'session', 'auth_info_baileys', 'baileys_auth_info',
    '.whatsapp-session', 'whatsapp-session', 'whatsapp-sessions', '.wwebjs_auth', '.wwebjs_cache',
    'node_modules', '.runtime', '.test-runtime', '.cache', 'coverage', '.next', '.turbo',
    'logs', 'tmp', 'temp', 'downloads', 'cache', 'dist', 'build', 'test-reports',
  ]);
  if (parts.some(part => localOnlyDirectories.has(part.toLowerCase()))) return true;
  if (parts.some((part, index) => part === 'archive' && parts[index - 1] === 'docs' && parts[index + 1] === 'patches') || (parts.includes('patches') && /\.patch$/i.test(base))) return true;
  if (parts.includes('test') && parts.includes('reports')) return true;
  if (base === '.env' || (base.startsWith('.env.') && (base !== '.env.example' || normalized !== '.env.example'))) return true;
  if (base === '.npmrc' || base === '.netrc') return true;
  if (/^(?:id_rsa|id_ed25519)$/.test(base)) return true;
  if (/\.(?:db|db-wal|db-shm|db-journal|sqlite|sqlite3|sqlite-wal|sqlite-shm|sqlite-journal|realm|rdb|ldb|sst|mdb|mdf|ldf|ibd|frm|myd|myi|dump|bak|backup|pem|key|p12|pfx|jks|keystore|p8|der|crt|cer|asc|secret|secrets|session|cookie)$/i.test(base)) return true;
  if (/^(?:credentials|secrets|token)\.json$/i.test(base) || /^service-account.*\.json$/i.test(base)) return true;
  if (/\.(?:log|tap)$/i.test(base) || /\.log\..+$/i.test(base)) return true;
  if (/\.corrupt-|\.migrated-/i.test(base)) return true;
  return false;
}

let tracked;
try {
  const repoRoot = runGit(['rev-parse', '--show-toplevel']).trim();
  if (path.resolve(repoRoot) !== PROJECT_ROOT) throw new Error('root Git berbeda dari root project Whiskay Bot.');
  tracked = runGit(['ls-files', '-z']).split('\0').filter(Boolean);
} catch (error) {
  console.error(`ERROR: ${error.message || 'jalankan perintah ini dari dalam Git repository Whiskay Bot.'}`);
  process.exit(2);
}

const privateFiles = tracked.filter(isPrivatePath);
if (privateFiles.length === 0) {
  console.log('OK: tidak ada file database/runtime/session/credential yang tercatat di Git index.');
  console.log('Semua data/ dan sessions/ tetap lokal; aset statis yang boleh dibagikan berada di assets/.');
  process.exit(0);
}

console.log('Mengeluarkan file private/runtime dari Git index; byte lokal TIDAK dihapus:');
for (const file of privateFiles) console.log(`  - ${file}`);
// Batch the pathspec so repositories with thousands of local database/session
// files do not exceed the operating system's maximum command-line size.
for (let offset = 0; offset < privateFiles.length; offset += 200) {
  const batch = privateFiles.slice(offset, offset + 200);
  execFileSync('git', ['rm', '--cached', '-f', '--', ...batch], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
  });
}
console.log(`SELESAI: ${privateFiles.length} file dilepas dari index. Salinan lokal tetap utuh.`);

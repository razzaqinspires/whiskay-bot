import 'dotenv/config';
import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flags = {
  clear: args.includes('--clear') || args.includes('-c'),
  number: args.find(a => /^\d{10,15}$/.test(a)) || null,
  help: args.includes('--help') || args.includes('-h')
};

if (flags.help) {
  console.log(`
Whiskay Pairing Helper
----------------------
Usage:
  node pair.js 6283193905842          # Set number + enable pairing
  node pair.js --clear                # Clear session only
  node pair.js 6283193905842 --clear  # Both
  node pair.js --help                 # This help

After running, start the bot:
  npm start

Read the 8-digit PAIRING CODE from terminal.
  `);
  process.exit(0);
}

if (flags.clear) {
  const sess = process.env.SESSION_DIR || './sessions';
  if (existsSync(sess)) {
    rmSync(sess, { recursive: true, force: true });
    console.log('🧹 Cleared ' + sess);
  } else {
    console.log('ℹ️  Session folder sudah kosong');
  }
}

if (flags.number) {
  const envPath = path.resolve('.env');
  if (!existsSync(envPath)) {
    console.error('❌ .env tidak ditemukan di ' + envPath);
    process.exit(1);
  }
  let env = readFileSync(envPath, 'utf8');
  const clean = String(flags.number).replace(/[^0-9]/g, '');

  // Update or append PAIRING_NUMBER
  if (/^PAIRING_NUMBER=.*$/m.test(env)) {
    env = env.replace(/^PAIRING_NUMBER=.*$/m, 'PAIRING_NUMBER=' + clean);
  } else {
    env += '\nPAIRING_NUMBER=' + clean + '\n';
  }

  // Update or append PAIRING_CODE
  if (/^PAIRING_CODE=.*$/m.test(env)) {
    env = env.replace(/^PAIRING_CODE=.*$/m, 'PAIRING_CODE=true');
  } else {
    env += '\nPAIRING_CODE=true\n';
  }

  writeFileSync(envPath, env);
  console.log('✅ PAIRING_NUMBER=' + clean);
  console.log('✅ PAIRING_CODE=true');
  console.log('');
  console.log('Verifikasi:');
  console.log('  grep PAIRING .env');
}

console.log('');
console.log('Next: npm start');

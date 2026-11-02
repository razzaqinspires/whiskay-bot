import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');

// Load the project's environment regardless of the caller's current directory.
loadEnv({ path: ENV_PATH });

const args = process.argv.slice(2);
const flags = {
  clear: args.includes('--clear') || args.includes('-c'),
  number: args.find((value) => /^\d{10,15}$/.test(value)) || null,
  help: args.includes('--help') || args.includes('-h'),
};

if (flags.help) {
  console.log(`
Whiskay Pairing Helper
----------------------
Usage:
  node scripts/pair.mjs 6283193905842          # Set number + enable pairing
  node scripts/pair.mjs --clear                # Clear session only
  node scripts/pair.mjs 6283193905842 --clear  # Both
  node scripts/pair.mjs --help                 # This help

After running, start the bot:
  npm start

Read the 8-digit PAIRING CODE from terminal.
  `);
  process.exit(0);
}

if (flags.clear) {
  const configuredSessionDir = process.env.SESSION_DIR || './sessions';
  const sessionDir = path.isAbsolute(configuredSessionDir)
    ? configuredSessionDir
    : path.resolve(PROJECT_ROOT, configuredSessionDir);

  if (existsSync(sessionDir)) {
    rmSync(sessionDir, { recursive: true, force: true });
    console.log(`🧹 Cleared ${sessionDir}`);
  } else {
    console.log('ℹ️  Session folder sudah kosong');
  }
}

if (flags.number) {
  if (!existsSync(ENV_PATH)) {
    console.error(`❌ .env tidak ditemukan di ${ENV_PATH}`);
    process.exit(1);
  }

  const cleanNumber = flags.number.replace(/[^0-9]/g, '');
  let env = readFileSync(ENV_PATH, 'utf8');

  const updateEnvValue = (key, value) => {
    const expression = new RegExp(`^${key}=.*$`, 'm');
    if (expression.test(env)) {
      env = env.replace(expression, `${key}=${value}`);
    } else {
      env = `${env.replace(/\s*$/, '')}\n${key}=${value}\n`;
    }
  };

  updateEnvValue('PAIRING_NUMBER', cleanNumber);
  updateEnvValue('PAIRING_CODE', 'true');
  writeFileSync(ENV_PATH, env);

  console.log(`✅ PAIRING_NUMBER=${cleanNumber}`);
  console.log('✅ PAIRING_CODE=true');
  console.log('\nVerifikasi:');
  console.log('  grep PAIRING .env');
}

console.log('\nNext: npm start');

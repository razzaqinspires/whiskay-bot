import 'dotenv/config';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envFile = () => path.resolve(process.env.ENV_FILE || path.join(ROOT_DIR, '.env'));

const normOwner = value => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('@')) return raw;
  const digits = raw.replace(/[^0-9]/g, '');
  return digits ? `${digits}@s.whatsapp.net` : '';
};
const normLid = value => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.endsWith('@lid')) return raw;
  const digits = raw.replace(/[^0-9]/g, '');
  return digits ? `${digits}@lid` : '';
};
const csv = value => String(value || '').split(',').map(v => v.trim()).filter(Boolean);
const bool = (value, fallback = false) => value == null || value === '' ? fallback : ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());

function createConfig(env = process.env) {
  const owners = [...new Set(csv(env.OWNERS).map(normOwner).filter(Boolean))];
  const ownerLids = [...new Set(csv(env.OWNER_LIDS).map(normLid).filter(Boolean))];
  return {
    botName: env.BOT_NAME || 'WhiskayBot',
    ownerName: env.OWNER_NAME || 'Arifi Razzaq',
    prefixes: csv(env.PREFIXES || '.,!,/,#'),
    owners,
    ownerLids,
    sessionDir: env.SESSION_DIR || './sessions',
    sourceDir: env.SOURCE_DIR || './src',
    sourceReload: bool(env.SOURCE_RELOAD, false),
    watchPlugins: bool(env.WATCH_PLUGINS, false),
    pluginDir: env.PLUGIN_DIR || './src/plugins',
    logLevel: env.LOG_LEVEL || 'info',
    website: {
      baseUrl: env.WEBSITE_BASE_URL || 'https://whiskay-rpg-companion.vercel.app',
      apiToken: env.WEBSITE_API_TOKEN || '',
      timeoutMs: Number(env.WEBSITE_API_TIMEOUT_MS || 8000),
      menuImageUrl: env.MENU_IMAGE_URL || '',
      rpgImageUrl: env.RPG_PROFILE_IMAGE_URL || ''
    },
    rateLimit: { windowMs: 10000, max: 15 },
    cooldown: 2500,
    security: { adminJids: [], owners, ownerLids },
    premiumUsers: [],
    pairing: {
      enabled: bool(env.PAIRING_CODE, false) || Boolean(env.PAIRING_NUMBER),
      number: String(env.PAIRING_NUMBER || '').replace(/[^0-9]/g, ''),
      customCode: env.PAIRING_CUSTOM_CODE || null,
      browser: env.BOT_BROWSER || 'Ubuntu',
      autoClearSessionOnLogout: bool(env.AUTO_CLEAR_SESSION, false)
    },
    cleanup: {
      enabled: bool(env.AUTOCLEAN, false),
      intervalMs: Number(env.AUTOCLEAN_INTERVAL || 300000),
      paths: csv(env.AUTOCLEAN_PATHS || './src,./')
    }
  };
}

// Keep object identity stable: all existing ESM imports observe in-place refreshes.
const config = createConfig();
let reloadInProgress = null;
export async function reloadConfigFromEnvFile({ file = envFile() } = {}) {
  if (reloadInProgress) return reloadInProgress;
  reloadInProgress = (async () => {
    let parsed = {};
    try { parsed = dotenv.parse(await readFile(file)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const changedKeys = [];
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] !== value) changedKeys.push(key);
      process.env[key] = value;
    }
    Object.assign(config, createConfig());
    return { file, changedKeys, config };
  })().finally(() => { reloadInProgress = null; });
  return reloadInProgress;
}
export function getEnvFilePath() { return envFile(); }
export default config;

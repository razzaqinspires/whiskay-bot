import 'dotenv/config';
const env = process.env;

const normOwner = s => {
  const t = String(s || '').trim();
  if (!t) return '';
  if (t.includes('@')) return t;
  const d = t.replace(/[^0-9]/g, '');
  return d ? `${d}@s.whatsapp.net` : '';
};

const normLid = s => {
  const t = String(s || '').trim();
  if (!t) return '';
  if (t.endsWith('@lid')) return t;
  const d = t.replace(/[^0-9]/g, '');
  return d ? `${d}@lid` : '';
};

const owners = (env.OWNERS || '').split(',').map(normOwner).filter(Boolean);
const ownerLids = (env.OWNER_LIDS || '').split(',').map(normLid).filter(Boolean);

export default Object.freeze({
  botName: env.BOT_NAME || 'WhiskayBot',
  prefixes: (env.PREFIXES || '.,!,/,#').split(',').map(p => p.trim()).filter(Boolean),
  owners,
  ownerLids,
  sessionDir: env.SESSION_DIR || './sessions',
  sourceDir: env.SOURCE_DIR || './src',
  sourceReload: env.SOURCE_RELOAD === 'true',
  pluginDir: env.PLUGIN_DIR || './src/plugins',
  logLevel: env.LOG_LEVEL || 'info',
  website: {
    baseUrl: env.WEBSITE_BASE_URL || '',
    apiToken: env.WEBSITE_API_TOKEN || '',
    timeoutMs: Number(env.WEBSITE_API_TIMEOUT_MS || 8000),
    menuImageUrl: env.MENU_IMAGE_URL || '',
    rpgImageUrl: env.RPG_PROFILE_IMAGE_URL || ''
  },
  rateLimit: { windowMs: 10000, max: 15 },
  cooldown: 2500,
  security: { adminJids: [], owners },
  premiumUsers: [],
  pairing: {
    enabled: env.PAIRING_CODE === 'true' || Boolean(env.PAIRING_NUMBER),
    number: (env.PAIRING_NUMBER || '').replace(/[^0-9]/g, ''),
    customCode: env.PAIRING_CUSTOM_CODE || null,
    browser: env.BOT_BROWSER || 'Ubuntu',
    autoClearSessionOnLogout: env.AUTO_CLEAR_SESSION === 'true'
  },
  cleanup: {
    enabled: env.AUTOCLEAN === 'true',
    intervalMs: Number(env.AUTOCLEAN_INTERVAL || 300_000),
    paths: (env.AUTOCLEAN_PATHS || './src,./').split(',').map(p => p.trim()).filter(Boolean)
  }
});

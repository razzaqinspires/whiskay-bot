/** Whitelisted .env controls exposed by the owner-only .config command. */
export const ENV_GROUPS = [
  { id: 'identity', title: 'Identitas & Owner', description: 'Nama bot, developer, prefix, dan nomor admin.' },
  { id: 'whatsapp', title: 'WhatsApp & Pairing', description: 'Nomor pairing, sesi, dan kebijakan registrasi.' },
  { id: 'ai', title: 'AI & Provider', description: 'Pemilihan model, prompt, dan API key.' },
  { id: 'website', title: 'Website & RPG', description: 'Endpoint website, sinkronisasi, dan token integrasi.' },
  { id: 'cloudflare', title: 'Cloudflared & Tunnel', description: 'Executable, port, retry, dan tunnel publik.' },
  { id: 'github', title: 'GitHub & Repository', description: 'Repository, token integrasi, dan sinkronisasi.' },
  { id: 'runtime', title: 'Runtime & Hot Reload', description: 'Log, plugin watcher, cleanup, dan direktori data.' },
  { id: 'features', title: 'Fitur & Media', description: 'Sticker, kalkulator, dan pengaturan fitur.' },
  { id: 'downloads', title: 'Downloader API', description: 'Endpoint provider downloader eksternal; URL dapat mengandung token, sehingga disamarkan.' }
];

const define = (group, keys, options = {}) => keys.split(/\s+/).filter(Boolean).map(key => ({
  key, group, type: 'string', secret: false, hotReloadable: false, ...options
}));

export const ENV_SETTINGS = [
  ...define('identity', 'BOT_NAME OWNER_NAME OWNER_PHONE OWNERS OWNER_LIDS PREFIXES', { hotReloadable: true }),
  ...define('whatsapp', 'BOT_WHATSAPP_NUMBER PAIRING_NUMBER PAIRING_CUSTOM_CODE BOT_BROWSER SESSION_DIR', {}),
  ...define('whatsapp', 'PAIRING_CODE AUTO_CLEAR_SESSION REQUIRE_USER_REGISTRATION', { type: 'boolean', hotReloadable: true }),
  ...define('ai', 'AI_PROVIDER AI_CHAT_MODE GEMINI_MODEL OPENAI_MODEL WHISKAY_IMAGE_MODEL', { hotReloadable: true }),
  ...define('ai', 'AI_SYSTEM_PROMPT', { hotReloadable: true, maxLength: 4000 }),
  ...define('ai', 'OPENAI_API_KEY OPENAI_API_KEYS GEMINI_API_KEY GEMINI_API_KEYS', { secret: true, hotReloadable: true, maxLength: 12000 }),
  ...define('ai', 'OPENAI_BASE_URL', { type: 'url', hotReloadable: true }),
  ...define('website', 'WEBSITE_BASE_URL DUNGEON_WEBSITE_URL JADIBOT_PORTAL_URL JADIBOT_PUBLIC_URL', { type: 'url', hotReloadable: true }),
  ...define('website', 'WEBSITE_API_TOKEN BOT_SYNC_TOKEN', { secret: true, hotReloadable: true }),
  ...define('website', 'DUNGEON_SYNC_TOKEN WHISKAY_BOSS_WEBHOOK_SECRET TEAMDROP_WEBHOOK_SECRET', { secret: true }),
  ...define('website', 'TEAMDROP_WHATSAPP_TO', { secret: true }),
  ...define('website', 'TEAMDROP_MAX_FILE_MB TEAMDROP_WEBHOOK_RATE_LIMIT', { type: 'number', min: 1, max: 100000 }),
  ...define('website', 'WEBSITE_API_TIMEOUT_MS RPG_ECONOMY_TIMEOUT_MS', { type: 'number', min: 500, max: 120000, hotReloadable: true }),
  ...define('cloudflare', 'CLOUDFLARED_BIN JADIBOT_BIN_DIR JADIBOT_LAST_TRYCLOUDFLARE_URL', {}),
  ...define('cloudflare', 'JADIBOT_TUNNEL', { enum: ['auto', 'on', 'off'] }),
  ...define('cloudflare', 'WHISKAY_WEBHOOK_TUNNEL_ENABLED', { type: 'boolean' }),
  ...define('cloudflare', 'WHISKAY_TUNNEL_GITHUB_SYNC', { type: 'boolean', hotReloadable: true }),
  ...define('cloudflare', 'WHISKAY_BOT_WEBHOOK_HOST', {}),
  ...define('cloudflare', 'WHISKAY_BOT_WEBHOOK_PORT JADIBOT_PORT JADIBOT_DEFAULT_DAYS JADIBOT_PRICE_30D JADIBOT_PUBLIC_URL_WAIT_MS JADIBOT_TUNNEL_WAIT_MS WHISKAY_TUNNEL_RETRY_MS WHISKAY_TUNNEL_RETRY_MAX_MS WHISKAY_TUNNEL_START_TIMEOUT_MS', { type: 'number', min: 1, max: 600000 }),
  ...define('cloudflare', 'JADIBOT_HOST JADIBOT_DATA_DIR', {}),
  ...define('github', 'WHISKAY_GITHUB_REPO WHISKAY_RPG_GITHUB_REPO', {}),
  ...define('github', 'WHISKAY_RPG_PROJECT_DIR', {}),
  ...define('github', 'GITHUB_TOKEN WHISKAY_GITHUB_TOKEN WHISKAY_GITHUB_SYNC_TOKEN WHISKAY_GITHUB_TRAFFIC_TOKEN', { secret: true }),
  ...define('runtime', 'NODE_ENV LOG_LEVEL SOURCE_DIR PLUGIN_DIR WHISKAY_DATA_DIR WHISKAY_GROUP_SETTINGS_FILE', {}),
  ...define('runtime', 'PORT', { type: 'number', min: 1, max: 65535 }),
  ...define('runtime', 'SOURCE_RELOAD WATCH_PLUGINS AUTOCLEAN ENV_RELOAD_ENABLED', { type: 'boolean' }),
  ...define('runtime', 'AUTOCLEAN_INTERVAL ENV_RELOAD_DEBOUNCE_MS WHISKAY_DB_ARCHIVE_BYTES', { type: 'number', min: 100, max: 2147483647 }),
  ...define('runtime', 'AUTOCLEAN_PATHS', { hotReloadable: true }),
  ...define('features', 'STICKER_AUTHOR STICKER_PACK_NAME BOT_LOGO_PATH OWNER_AVATAR_PATH PYTHON_BIN MENU_IMAGE_URL RPG_PROFILE_IMAGE_URL', { hotReloadable: true }),
  ...define('features', 'EGG_CALCULATOR_URL', { type: 'url', hotReloadable: true }),
  ...define('features', 'ANTILINK_AUTO_KICK SYNTAX_DOCTOR_ENABLED', { type: 'boolean', hotReloadable: true }),
  ...define('features', 'ANTILINK_KICK_AFTER WHISKAY_WEBHOOK_RATE_LIMIT SNAKE_LADDERS_PRIZE', { type: 'number', min: 0, max: 100000000, hotReloadable: true }),
  ...define('features', 'WHISKAY_BOSS_TARGET_GROUPS', { hotReloadable: true }),
  ...define('downloads', 'MEDIA_DOWNLOADER_API_URL MEDIA_DOWNLOADER_API_URLS', { secret: true, hotReloadable: true, maxLength: 12000 })
];

// Keep a single authoritative entry per key when controls appear in multiple groups.
const unique = new Map();
for (const setting of ENV_SETTINGS) unique.set(setting.key, setting);
ENV_SETTINGS.splice(0, ENV_SETTINGS.length, ...unique.values());

export const ENV_SETTING_MAP = new Map(ENV_SETTINGS.map(item => [item.key, item]));
export const RESTART_REQUIRED_KEYS = new Set(ENV_SETTINGS.filter(item => !item.hotReloadable).map(item => item.key));

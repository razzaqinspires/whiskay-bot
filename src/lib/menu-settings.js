import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.WHISKAY_DATA_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const SETTINGS_FILE = path.join(ROOT, 'menu-settings.json');
const LEDGER_FILE = path.join(ROOT, 'menu-command-ledger.json');
const USAGE_FILE = path.join(ROOT, 'menu-command-usage.json');
const RECOMMENDATION_FILE = path.join(ROOT, 'recommendation-settings.json');
const GLOBAL_DEFAULTS_FILE = path.join(ROOT, 'menu-global-defaults.json');
const DAY = 24 * 60 * 60 * 1000;
const DEFAULTS = Object.freeze({
  template: 'corporate',
  energyDetails: false,
  font: 'normal',
  batteryDisplayStyle: 'match_menu',
  widgetDesign: 'classic',
  showEnergyWidget: true,
  showNextPageInfo: true,
  commandPageLimitEnabled: true,
  profileWidgets: ['userprofile','progress','economy','familiarity','premium','smartenergy'],
  batteryNotification: 'merge',
  description: true,
  categoriesVisible: true,
  order: 'category',
  showEnergyEmoji: true,
  showEnergyNumbers: false,
  mode: 'buttons',
  categories: [],
  linePrefix: false,
  topBorder: true,
  bottomBorder: true,
  spacing: 1,
  widgets: ['category','count','prefix','new','owner','footer','heading','intro','website','rank','toprank','toplevels','modcoins','userprofile','progress','economy','familiarity','worker','premium','rankmatrix','websiteProducts','info','rpgstatus','leaderboard','commandhits','balance','totalusers','registeredusers','biocore','events','messages','uptime','database'],
  imageMode: 'official',
  imagePath: '',
  boldParts: [],
  widgetSymbolBefore: '',
  widgetSymbolAfter: '',
  showWidgetSymbols: true,
  showWidgetSymbolBefore: true,
  showWidgetSymbolAfter: true,
  widgetNumbering: false,
  recommendationEnabled: true,
  menuResponseMode: 'classic',
  forwardedLabelMode: 'full',
  fakeContactName: 'Whiskay Contact Demo',
  fakeContactNumber: '6280000000000',
  fakeProductName: 'Whiskay Demo Product',
  fakeProductPrice: 'Rp10.000',
  fakeProductImageUrl: '',
  quoteMode: 'default',
  quoteExperiment: '',
  commandPageSize: 100
});

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch { return fallback; }
}
async function writeJson(file, value) {
  await mkdir(ROOT, { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await rename(tmp, file);
}
export function defaultMenuSettings() { return structuredClone(DEFAULTS); }
export async function getMenuSettings(userId) {
  const all = await readJson(SETTINGS_FILE, {});
  const global = await readJson(GLOBAL_DEFAULTS_FILE, {});
  const settings = { ...defaultMenuSettings(), ...(global.settings || {}), ...(all[String(userId || 'unknown')] || {}) };
  if (!['match_menu','default'].includes(settings.batteryDisplayStyle)) settings.batteryDisplayStyle = 'match_menu';
  if (!['hide','merge','separate'].includes(settings.batteryNotification)) settings.batteryNotification = 'merge';
  if (!['classic','minimal','cyberpunk','kawaii','boxed','elegant','japanese','developer'].includes(settings.widgetDesign)) settings.widgetDesign = 'classic';
  settings.commandPageSize = Math.max(100, Math.min(500, Math.floor(Number(settings.commandPageSize) || 100)));
  if (!Array.isArray(settings.profileWidgets)) settings.profileWidgets = defaultMenuSettings().profileWidgets;
  return settings;
}
export async function updateMenuSettings(userId, patch) {
  const all = await readJson(SETTINGS_FILE, {});
  const key = String(userId || 'unknown');
  all[key] = { ...(all[key] || {}), ...patch };
  await writeJson(SETTINGS_FILE, all);
  return all[key];
}
export async function resetMenuSettings(userId) {
  const all = await readJson(SETTINGS_FILE, {});
  delete all[String(userId || 'unknown')];
  await writeJson(SETTINGS_FILE, all);
  return getMenuSettings(userId);
}
export async function setGlobalMenuDefaults(settings, actor='owner') {
  const builtIn = defaultMenuSettings();
  const safe = { ...builtIn, ...settings, imageMode: 'official', imagePath: '' };
  const payload = { settings: safe, updatedAt: new Date().toISOString(), updatedBy: String(actor).slice(0,80) };
  await writeJson(GLOBAL_DEFAULTS_FILE, payload);
  // Migrate legacy fully-materialized user settings: values equal to the old built-in
  // defaults were not meaningful overrides, so allow them to inherit the new baseline.
  const all = await readJson(SETTINGS_FILE, {});
  for (const record of Object.values(all)) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    for (const [key, value] of Object.entries(record)) {
      if (Object.prototype.hasOwnProperty.call(builtIn, key) && JSON.stringify(value) === JSON.stringify(builtIn[key])) delete record[key];
    }
  }
  await writeJson(SETTINGS_FILE, all);
  return payload;
}
export async function getGlobalMenuDefaults() { return readJson(GLOBAL_DEFAULTS_FILE, { settings: defaultMenuSettings(), updatedAt: null, updatedBy: null }); }
export async function clearGlobalMenuDefaults() { await writeJson(GLOBAL_DEFAULTS_FILE, { settings: defaultMenuSettings(), updatedAt: new Date().toISOString(), updatedBy: 'factory-reset' }); return defaultMenuSettings(); }
export async function resetMenuSettingKeys(userId, keys=[]) { const all=await readJson(SETTINGS_FILE,{}), key=String(userId||'unknown'); const current=all[key]||{}; for(const name of keys) delete current[name]; all[key]=current; await writeJson(SETTINGS_FILE,all); return getMenuSettings(userId); }

// Record the first time each canonical command appears. The NEW badge expires
// after seven days without needing a timer or background job.
export async function getNewCommandSet(commands, now = Date.now()) {
  const ledger = await readJson(LEDGER_FILE, {});
  const live = new Set(commands.map(c => c.toLowerCase()));
  const initialized = Boolean(ledger.__meta?.initialized);
  if (!initialized) {
    // On first deployment, don't label every existing command as new. Only the
    // newly introduced `.setmenu` command gets the initial seven-day badge.
    for (const command of live) {
      const isNewInThisRelease = command === 'setmenu';
      ledger[command] = { firstSeen: now, newUntil: isNewInThisRelease ? now + 7 * DAY : now };
    }
    ledger.__meta = { initialized: true, initializedAt: now };
  } else {
    for (const command of live) {
      if (!ledger[command]) ledger[command] = { firstSeen: now, newUntil: now + 7 * DAY };
    }
  }
  for (const command of Object.keys(ledger)) {
    if (command === '__meta') continue;
    if (!live.has(command)) delete ledger[command];
  }
  await writeJson(LEDGER_FILE, ledger);
  return new Set([...live].filter(c => Number(ledger[c]?.newUntil || 0) > now));
}
export const MENU_DEFAULTS = DEFAULTS;

// Per-user command usage powers personalized command recommendations.
export async function recordCommandUsage(userId, command, now = Date.now()) {
  const all = await readJson(USAGE_FILE, {});
  const user = String(userId || 'unknown');
  const cmd = String(command || '').toLowerCase();
  if (!cmd || ['menu', 'setmenu'].includes(cmd)) return;
  if (!all[user]) all[user] = {};
  const item = all[user][cmd] || { count: 0, lastUsed: 0 };
  item.count += 1; item.lastUsed = now; all[user][cmd] = item;
  await writeJson(USAGE_FILE, all);
}
export async function getCommandRecommendations(userId, available = [], limit = 1) {
  const all = await readJson(USAGE_FILE, {});
  const user = all[String(userId || 'unknown')] || {};
  const valid = new Set(available.map(x => String(x.command || x).toLowerCase()));
  const items = Object.entries(user).filter(([cmd]) => valid.has(cmd));
  const total = items.reduce((n, [, v]) => n + Number(v.count || 0), 0);
  return items.sort((a, b) => Number(b[1].count || 0) - Number(a[1].count || 0)).slice(0, limit).map(([command, v]) => ({ command, count: Number(v.count || 0), percentage: total ? Math.round(Number(v.count || 0) / total * 100) : 0 }));
}

export async function getGlobalRecommendationsEnabled() { const data = await readJson(RECOMMENDATION_FILE, { enabled: true }); return data.enabled !== false; }
export async function setGlobalRecommendationsEnabled(enabled, actor = 'owner') { const data = { enabled: Boolean(enabled), updatedAt: new Date().toISOString(), updatedBy: String(actor).slice(0, 80) }; await writeJson(RECOMMENDATION_FILE, data); return data; }

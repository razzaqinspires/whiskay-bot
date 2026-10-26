import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const settingsPath = () => process.env.WHISKAY_GROUP_SETTINGS_FILE
  ? path.resolve(process.env.WHISKAY_GROUP_SETTINGS_FILE)
  : path.resolve(process.cwd(), 'data', 'group-settings.json');

const DEFAULTS = Object.freeze({
  antilink: false,
  antispam: false,
  welcome: false,
  welcomeText: '👋 Selamat datang {user} di {group}! Baca deskripsi grup sebelum mulai.',
  leaveText: '👋 {user} telah meninggalkan grup.'
});

async function readAll() {
  try {
    const data = JSON.parse(await readFile(settingsPath(), 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    return {};
  }
}

export async function getGroupSettings(groupId) {
  if (!String(groupId || '').endsWith('@g.us')) throw new TypeError('groupId tidak valid');
  const all = await readAll();
  const saved = all[groupId] && typeof all[groupId] === 'object' ? all[groupId] : {};
  return { ...DEFAULTS, ...saved };
}

export async function updateGroupSettings(groupId, patch) {
  if (!String(groupId || '').endsWith('@g.us')) throw new TypeError('groupId tidak valid');
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('patch tidak valid');
  const allowed = new Set(Object.keys(DEFAULTS));
  const safePatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) continue;
    if (['antilink', 'antispam', 'welcome'].includes(key)) safePatch[key] = Boolean(value);
    else if (typeof value === 'string') safePatch[key] = value.slice(0, 500);
  }
  const file = settingsPath();
  await mkdir(path.dirname(file), { recursive: true });
  const all = await readAll();
  all[groupId] = { ...DEFAULTS, ...(all[groupId] || {}), ...safePatch, updatedAt: new Date().toISOString() };
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
  await rename(tmp, file);
  return all[groupId];
}

export const GROUP_DEFAULTS = DEFAULTS;

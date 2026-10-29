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
  leaveText: '👋 {user} telah meninggalkan grup.',
  schedule: { closeAt: null, openAt: null, lastCloseDate: null, lastOpenDate: null },
  cmdblocked: [],
  blacklist: [],
  attendance: { title: null, openedAt: null, closedAt: null, entries: [] }
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

export async function getAllGroupSettings() {
  const all = await readAll();
  return Object.entries(all).filter(([id, value]) => id.endsWith('@g.us') && value && typeof value === 'object').map(([id, value]) => ({ groupId: id, settings: { ...DEFAULTS, ...value } }));
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
    else if (key === 'cmdblocked' && Array.isArray(value)) safePatch[key] = [...new Set(value.map(v => String(v).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40)).filter(Boolean))].slice(0, 100);
    else if (key === 'blacklist' && Array.isArray(value)) safePatch.blacklist = [...new Set(value.map(v => String(v).trim().slice(0, 160)).filter(v => /@(s\.whatsapp\.net|lid)$/.test(v)))].slice(0, 500);
    else if (key === 'attendance' && value && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Array.isArray(value.entries) ? value.entries.filter(e => e && typeof e === 'object' && typeof e.jid === 'string' && e.jid.length <= 160).slice(0, 1000).map(e => ({ jid: e.jid, name: String(e.name || e.jid).slice(0, 100), at: typeof e.at === 'string' ? e.at.slice(0, 40) : new Date().toISOString() })) : [];
      safePatch.attendance = { title: typeof value.title === 'string' ? value.title.slice(0, 100) : null, openedAt: typeof value.openedAt === 'string' ? value.openedAt.slice(0, 40) : null, closedAt: typeof value.closedAt === 'string' ? value.closedAt.slice(0, 40) : null, entries };
    }
    else if (key === 'schedule' && value && typeof value === 'object' && !Array.isArray(value)) {
      const time = v => v === null || v === '' ? null : (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? String(v) : undefined);
      const closeAt = time(value.closeAt), openAt = time(value.openAt);
      if (closeAt !== undefined && openAt !== undefined) safePatch.schedule = { closeAt, openAt, lastCloseDate: typeof value.lastCloseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.lastCloseDate) ? value.lastCloseDate : null, lastOpenDate: typeof value.lastOpenDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.lastOpenDate) ? value.lastOpenDate : null };
    }
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

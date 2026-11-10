import { mkdir, readFile, rename, writeFile, open, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const configuredRoot = process.env.WHISKAY_DATA_DIR;
const DATA_ROOT = configuredRoot
  ? (path.isAbsolute(configuredRoot) ? configuredRoot : path.resolve(PROJECT_ROOT, configuredRoot))
  : path.join(PROJECT_ROOT, 'data');
const FILE = path.join(DATA_ROOT, 'adzan-profiles.json');
const BACKUP = `${FILE}.bak`;
const LEGACY_FILE = path.join(DATA_ROOT, 'adzan-settings.json');
const LOCK = `${FILE}.lock`;
const SCHEMA_VERSION = 1;
const REQUEST_TTL_MS = 10 * 60_000;
let writeQueue = Promise.resolve();

const DEFAULT_TIMES = Object.freeze({ subuh: '04:45', dzuhur: '12:15', ashar: '15:30', maghrib: '18:20', isya: '19:30' });
const DEFAULT_TIMEZONE = 'Asia/Jakarta';
const emptyState = () => ({ schemaVersion: SCHEMA_VERSION, ownerDefault: null, users: {}, groups: {}, pendingLocations: {}, personalAdzanEvents: {}, updatedAt: null });
const safeId = value => String(value || '').trim().slice(0, 180);
const validCoordinates = (latitude, longitude) => Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
const validTimezone = timezone => {
  if (typeof timezone !== 'string' || timezone.length > 80) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); return true; } catch { return false; }
};
function validateState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Number(value.schemaVersion) !== SCHEMA_VERSION) return false;
  if (!value.users || typeof value.users !== 'object' || Array.isArray(value.users)) return false;
  if (!value.pendingLocations || typeof value.pendingLocations !== 'object' || Array.isArray(value.pendingLocations)) return false;
  if (!value.groups || typeof value.groups !== 'object' || Array.isArray(value.groups)) return false;
  if (value.personalAdzanEvents != null && (!value.personalAdzanEvents || typeof value.personalAdzanEvents !== 'object' || Array.isArray(value.personalAdzanEvents))) return false;
  if (value.ownerDefault !== null && (!value.ownerDefault || typeof value.ownerDefault !== 'object' || !validCoordinates(value.ownerDefault.latitude, value.ownerDefault.longitude) || (value.ownerDefault.timezone != null && !validTimezone(value.ownerDefault.timezone)))) return false;
  for (const settings of Object.values(value.groups)) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
    if (settings.timezone != null && !validTimezone(settings.timezone)) return false;
    if (settings.times != null && (!settings.times || typeof settings.times !== 'object' || Array.isArray(settings.times) || Object.values(settings.times).some(time => typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)))) return false;
  }
  for (const profile of Object.values(value.users)) {
    if (!profile || typeof profile !== 'object') return false;
    if (profile.location && !validCoordinates(profile.location.latitude, profile.location.longitude)) return false;
    if (profile.timezone != null && !validTimezone(profile.timezone)) return false;
    if (profile.adzanEnabled != null && typeof profile.adzanEnabled !== 'boolean') return false;
    if (profile.adzanAudioEnabled != null && typeof profile.adzanAudioEnabled !== 'boolean') return false;
    if (profile.fridayReminderEnabled != null && typeof profile.fridayReminderEnabled !== 'boolean') return false;
    if (profile.fridayReminderTime != null && (typeof profile.fridayReminderTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(profile.fridayReminderTime))) return false;
    if (profile.ramadanReminderEnabled != null && typeof profile.ramadanReminderEnabled !== 'boolean') return false;
    if (profile.sahurReminderMinutes != null && (!Number.isInteger(profile.sahurReminderMinutes) || profile.sahurReminderMinutes < 0 || profile.sahurReminderMinutes > 120)) return false;
    if (profile.iftarReminderEnabled != null && typeof profile.iftarReminderEnabled !== 'boolean') return false;
    if (profile.iftarReminderMinutes != null && (!Number.isInteger(profile.iftarReminderMinutes) || profile.iftarReminderMinutes < 0 || profile.iftarReminderMinutes > 60)) return false;
    if (profile.preAlertMinutes != null && (!Number.isInteger(profile.preAlertMinutes) || profile.preAlertMinutes < 0 || profile.preAlertMinutes > 30)) return false;
    if (profile.methodId != null && !['indonesia-kemenag-reference', 'mwl', 'egyptian'].includes(profile.methodId)) return false;
    if (profile.corrections != null && (!profile.corrections || typeof profile.corrections !== 'object' || Array.isArray(profile.corrections) || Object.entries(profile.corrections).some(([key, value]) => !['fajr','dhuhr','asr','maghrib','isha'].includes(key) || !Number.isInteger(value) || Math.abs(value) > 30))) return false;
    if (profile.audioPack != null && !['default', 'custom'].includes(profile.audioPack)) return false;
  }
  return true;
}
async function parseCandidate(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (!validateState(parsed)) throw new Error(`Invalid Adzan profile schema in ${path.basename(file)}`);
    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}
async function fsyncDirectory(dir) {
  let handle;
  try { handle = await open(dir, 'r'); await handle.sync(); } catch {} finally { await handle?.close().catch(() => {}); }
}
async function atomicReplace(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  const handle = await open(tmp, 'wx', 0o600);
  try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
  await rename(tmp, file);
  await fsyncDirectory(path.dirname(file));
}
async function withProcessLock(fn) {
  await mkdir(DATA_ROOT, { recursive: true, mode: 0o700 });
  const started = Date.now();
  let handle;
  while (!handle) {
    try {
      handle = await open(LOCK, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() }));
      await handle.sync();
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const info = await stat(LOCK);
        if (Date.now() - info.mtimeMs > 10 * 60_000) { await unlink(LOCK).catch(() => {}); continue; }
      } catch {}
      if (Date.now() - started > 30_000) throw new Error('Adzan profile database terkunci lebih dari 30 detik.');
      await new Promise(resolve => setTimeout(resolve, 60));
    }
  }
  try { return await fn(); } finally { await handle.close().catch(() => {}); await unlink(LOCK).catch(() => {}); }
}
function enqueueWrite(fn) {
  const task = writeQueue.then(() => withProcessLock(fn), () => withProcessLock(fn));
  writeQueue = task.catch(() => {});
  return task;
}
async function readState() {
  await mkdir(DATA_ROOT, { recursive: true, mode: 0o700 });
  try {
    const primary = await parseCandidate(FILE);
    if (primary) return primary;
  } catch (primaryError) {
    const backup = await parseCandidate(BACKUP).catch(() => null);
    if (!backup) throw new Error(`Database Adzan rusak dan backup tidak valid. File utama dipertahankan untuk investigasi: ${primaryError.message}`, { cause: primaryError });
    await rename(FILE, `${FILE}.corrupt-${Date.now()}`).catch(() => {});
    // Recover from the verified backup without rotating the backup over itself.
    await atomicReplace(FILE, Buffer.from(JSON.stringify(backup, null, 2)));
    return backup;
  }
  const backup = await parseCandidate(BACKUP).catch(() => null);
  if (backup) {
    await atomicReplace(FILE, Buffer.from(JSON.stringify(backup, null, 2)));
    return backup;
  }
  const fresh = emptyState();
  // One-time, lossless migration of the previous group-only Adzan settings file.
  try {
    const legacy = JSON.parse(await readFile(LEGACY_FILE, 'utf8'));
    if (legacy && typeof legacy === 'object' && legacy.chats && typeof legacy.chats === 'object') {
      fresh.groups = legacy.chats;
      const migrated = await persistState(fresh);
      await rename(LEGACY_FILE, `${LEGACY_FILE}.migrated-${Date.now()}`).catch(() => {});
      return migrated;
    }
  } catch (error) { if (error?.code !== 'ENOENT') throw new Error(`Legacy Adzan settings could not be migrated safely: ${error.message}`, { cause: error }); }
  return fresh;
}
async function persistState(state) {
  const next = { ...state, schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() };
  if (!validateState(next)) throw new TypeError('Refusing to persist invalid Adzan profile state.');
  const payload = Buffer.from(`${JSON.stringify(next, null, 2)}\n`);
  // A backup failure aborts the write. Never quarantine or replace the valid primary because backup creation failed.
  try {
    const old = await parseCandidate(FILE);
    if (old) {
      const previous = await readFile(FILE);
      await atomicReplace(BACKUP, previous);
      const verified = await parseCandidate(BACKUP);
      if (!verified) throw new Error('Backup verification failed; primary database was not changed.');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error(`Adzan backup could not be secured; write aborted: ${error.message}`, { cause: error });
  }
  await atomicReplace(FILE, payload);
  return next;
}
export async function getAdzanProfileStoreStatus() {
  const state = await readState();
  const files = {};
  for (const [name, file] of [['primary', FILE], ['backup', BACKUP]]) {
    try { const info = await stat(file); files[name] = { exists: true, bytes: info.size, modifiedAt: info.mtime.toISOString() }; }
    catch { files[name] = { exists: false, bytes: 0, modifiedAt: null }; }
  }
  return { file: FILE, schemaVersion: SCHEMA_VERSION, users: Object.keys(state.users).length, hasOwnerDefault: Boolean(state.ownerDefault), pendingLocations: Object.keys(state.pendingLocations).length, updatedAt: state.updatedAt, files };
}
function cancelQueuedPersonalEvents(state, user = null, reason = 'profile-updated') {
  const now = new Date().toISOString();
  let cancelled = 0;
  for (const item of Object.values(state.personalAdzanEvents || {})) {
    if (!item || item.status !== 'queued' || (user && item.user !== user)) continue;
    item.status = 'cancelled';
    item.cancelledAt = now;
    item.cancelReason = reason;
    delete item.nextAttemptAt;
    cancelled++;
  }
  return cancelled;
}

export async function requestAdzanLocation(user, { ownerDefault = false } = {}) {
  const id = safeId(user);
  if (!id) throw new TypeError('WhatsApp user ID is required.');
  return enqueueWrite(async () => {
    const state = await readState();
    state.pendingLocations[id] = { target: ownerDefault ? 'ownerDefault' : 'user', requestedAt: Date.now(), expiresAt: Date.now() + REQUEST_TTL_MS };
    await persistState(state);
    return { expiresAt: state.pendingLocations[id].expiresAt, target: state.pendingLocations[id].target };
  });
}
export async function saveAdzanSharedLocation(user, { latitude, longitude, name = '', address = '', isOwner = false } = {}) {
  const id = safeId(user);
  const lat = Number(latitude), lon = Number(longitude);
  if (!id) throw new TypeError('WhatsApp user ID is required.');
  if (!validCoordinates(lat, lon)) throw new TypeError('Koordinat lokasi tidak valid.');
  return enqueueWrite(async () => {
    const state = await readState();
    const pending = state.pendingLocations[id];
    if (!pending || Number(pending.expiresAt) < Date.now()) {
      if (pending) { delete state.pendingLocations[id]; await persistState(state); }
      return { saved: false, reason: 'no-pending-request' };
    }
    if (pending.target === 'ownerDefault' && !isOwner) return { saved: false, reason: 'owner-only' };
    const location = {
      latitude: lat, longitude: lon,
      name: String(name || '').trim().slice(0, 120),
      address: String(address || '').trim().slice(0, 240),
      mapUrl: `https://www.google.com/maps?q=${lat},${lon}`,
      capturedAt: new Date().toISOString(), source: 'whatsapp-location-share'
    };
    if (pending.target === 'ownerDefault') {
      state.ownerDefault = { ...location, timezone: state.ownerDefault?.timezone || 'Asia/Jakarta', methodId: state.ownerDefault?.methodId || 'indonesia-kemenag-reference', updatedBy: id };
      cancelQueuedPersonalEvents(state, null, 'owner-default-location-changed');
    } else {
      state.users[id] = { ...(state.users[id] || {}), location, updatedAt: new Date().toISOString() };
      cancelQueuedPersonalEvents(state, id, 'user-location-changed');
    }
    delete state.pendingLocations[id];
    await persistState(state);
    return { saved: true, target: pending.target, location };
  });
}
export async function setAdzanTimezone(user, timezone, { ownerDefault = false, isOwner = false } = {}) {
  const id = safeId(user);
  if (!id || !validTimezone(timezone)) throw new TypeError('Zona waktu harus berupa IANA timezone valid, contoh Asia/Jakarta.');
  if (ownerDefault && !isOwner) throw new Error('Hanya owner yang dapat mengubah zona waktu default.');
  return enqueueWrite(async () => {
    const state = await readState();
    if (ownerDefault) {
      if (!state.ownerDefault) throw new Error('Atur lokasi default owner terlebih dahulu dengan .adzan default.');
      state.ownerDefault.timezone = timezone;
      state.ownerDefault.updatedBy = id;
      cancelQueuedPersonalEvents(state, null, 'owner-default-timezone-changed');
    } else {
      state.users[id] = { ...(state.users[id] || {}), timezone, updatedAt: new Date().toISOString() };
      cancelQueuedPersonalEvents(state, id, 'user-timezone-changed');
    }
    await persistState(state);
    return getEffectiveAdzanProfileFromState(state, id);
  });
}
function getEffectiveAdzanProfileFromState(state, user) {
  const own = state.users[safeId(user)] || {};
  const owner = state.ownerDefault;
  const location = own.location || owner || null;
  const timezone = own.timezone || (own.location ? null : owner?.timezone) || owner?.timezone || 'Asia/Jakarta';
  return { location, timezone, adzanEnabled: own.adzanEnabled === true, preAlertMinutes: Number.isInteger(own.preAlertMinutes) ? own.preAlertMinutes : 0, fridayReminderEnabled: own.fridayReminderEnabled === true, fridayReminderTime: own.fridayReminderTime || '11:00', ramadanReminderEnabled: own.ramadanReminderEnabled === true, sahurReminderMinutes: Number.isInteger(own.sahurReminderMinutes) ? own.sahurReminderMinutes : 30, iftarReminderEnabled: own.iftarReminderEnabled !== false, iftarReminderMinutes: Number.isInteger(own.iftarReminderMinutes) ? own.iftarReminderMinutes : 0, methodId: own.methodId || owner?.methodId || 'indonesia-kemenag-reference', corrections: { ...(own.corrections || {}) }, audioPack: own.audioPack || 'default', source: own.location ? 'user' : (owner ? 'owner-default' : 'unconfigured'), hasOwnLocation: Boolean(own.location), hasOwnTimezone: Boolean(own.timezone) };
}
export async function getEffectiveAdzanProfile(user) {
  const state = await readState();
  return getEffectiveAdzanProfileFromState(state, user);
}


export async function updatePersonalAdzanSettings(user, patch = {}) {
  const id = safeId(user);
  if (!id || !patch || typeof patch !== 'object') throw new TypeError('Invalid Adzan settings.');
  const allowed = {};
  if (patch.methodId !== undefined) {
    if (!['indonesia-kemenag-reference', 'mwl', 'egyptian'].includes(patch.methodId)) throw new TypeError('Metode tidak dikenal.');
    allowed.methodId = patch.methodId;
  }
  if (patch.corrections !== undefined) {
    if (!patch.corrections || typeof patch.corrections !== 'object' || Array.isArray(patch.corrections)) throw new TypeError('Koreksi waktu tidak valid.');
    const corrections = {};
    for (const [key, value] of Object.entries(patch.corrections)) {
      if (!['fajr','dhuhr','asr','maghrib','isha'].includes(key) || !Number.isInteger(value) || Math.abs(value) > 30) throw new RangeError('Koreksi harus berupa menit bulat antara -30 sampai +30.');
      corrections[key] = value;
    }
    allowed.corrections = corrections;
  }
  if (patch.preAlertMinutes !== undefined) {
    if (!Number.isInteger(patch.preAlertMinutes) || patch.preAlertMinutes < 0 || patch.preAlertMinutes > 30) throw new RangeError('Pengingat awal harus 0 sampai 30 menit.');
    allowed.preAlertMinutes = patch.preAlertMinutes;
  }
  if (patch.fridayReminderEnabled !== undefined) { if (typeof patch.fridayReminderEnabled !== 'boolean') throw new TypeError('Status pengingat Jumat harus boolean.'); allowed.fridayReminderEnabled = patch.fridayReminderEnabled; }
  if (patch.fridayReminderTime !== undefined) { if (typeof patch.fridayReminderTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(patch.fridayReminderTime)) throw new TypeError('Waktu pengingat Jumat harus HH:mm (00:00–23:59).'); allowed.fridayReminderTime = patch.fridayReminderTime; }
  if (patch.ramadanReminderEnabled !== undefined) { if (typeof patch.ramadanReminderEnabled !== 'boolean') throw new TypeError('Status pengingat Ramadan harus boolean.'); allowed.ramadanReminderEnabled = patch.ramadanReminderEnabled; }
  if (patch.sahurReminderMinutes !== undefined) { if (!Number.isInteger(patch.sahurReminderMinutes) || patch.sahurReminderMinutes < 0 || patch.sahurReminderMinutes > 120) throw new RangeError('Pengingat sahur harus 0 sampai 120 menit sebelum Subuh.'); allowed.sahurReminderMinutes = patch.sahurReminderMinutes; }
  if (patch.iftarReminderEnabled !== undefined) { if (typeof patch.iftarReminderEnabled !== 'boolean') throw new TypeError('Status pengingat berbuka harus boolean.'); allowed.iftarReminderEnabled = patch.iftarReminderEnabled; }
  if (patch.iftarReminderMinutes !== undefined) { if (!Number.isInteger(patch.iftarReminderMinutes) || patch.iftarReminderMinutes < 0 || patch.iftarReminderMinutes > 60) throw new RangeError('Pengingat berbuka harus 0 sampai 60 menit sebelum Magrib.'); allowed.iftarReminderMinutes = patch.iftarReminderMinutes; }
  if (patch.audioPack !== undefined) {
    if (!['default','custom'].includes(patch.audioPack)) throw new TypeError('Paket audio harus default atau custom.');
    allowed.audioPack = patch.audioPack;
  }
  return enqueueWrite(async () => {
    const state = await readState();
    state.users[id] = { ...(state.users[id] || {}), ...allowed, updatedAt: new Date().toISOString() };
    cancelQueuedPersonalEvents(state, id, 'user-automation-settings-changed');
    await persistState(state);
    return getEffectiveAdzanProfileFromState(state, id);
  });
}
export async function getPersonalAdzanActivity(user, limit = 10) {
  const id = safeId(user);
  const state = await readState();
  return Object.values(state.personalAdzanEvents || {}).filter(item => item?.user === id)
    .sort((a,b) => Date.parse(b.createdAt || b.scheduledAt || 0) - Date.parse(a.createdAt || a.scheduledAt || 0))
    .slice(0, Math.max(1, Math.min(30, Number(limit) || 10)))
    .map(item => ({ prayer: item.prayer, date: item.date, scheduledAt: item.scheduledAt, status: item.status || 'claimed', attempts: item.attempts || 0, deliveredAt: item.deliveredAt || null, lastError: item.lastError || null, cancelReason: item.cancelReason || null }));
}

export async function setPersonalAdzanEnabled(user, enabled) {
  const id = safeId(user);
  if (!id) throw new TypeError('WhatsApp user ID is required.');
  return enqueueWrite(async () => {
    const state = await readState();
    state.users[id] = { ...(state.users[id] || {}), adzanEnabled: Boolean(enabled), updatedAt: new Date().toISOString() };
    if (!enabled) cancelQueuedPersonalEvents(state, id, 'notifications-disabled');
    await persistState(state);
    return state.users[id].adzanEnabled;
  });
}

export async function setPersonalAdzanAudioEnabled(user, enabled) {
  const id = safeId(user);
  if (!id) throw new TypeError('WhatsApp user ID is required.');
  return enqueueWrite(async () => {
    const state = await readState();
    state.users[id] = { ...(state.users[id] || {}), adzanAudioEnabled: Boolean(enabled), updatedAt: new Date().toISOString() };
    await persistState(state);
    return state.users[id].adzanAudioEnabled;
  });
}

export async function getPersonalAdzanPreferences(user) {
  const state = await readState();
  const profile = state.users[safeId(user)] || {};
  return { notificationsEnabled: profile.adzanEnabled === true, preAlertMinutes: Number.isInteger(profile.preAlertMinutes) ? profile.preAlertMinutes : 0, audioEnabled: profile.adzanAudioEnabled !== false, audioPack: profile.audioPack || 'default', fridayReminderEnabled: profile.fridayReminderEnabled === true, fridayReminderTime: profile.fridayReminderTime || '11:00', ramadanReminderEnabled: profile.ramadanReminderEnabled === true, sahurReminderMinutes: Number.isInteger(profile.sahurReminderMinutes) ? profile.sahurReminderMinutes : 30, iftarReminderEnabled: profile.iftarReminderEnabled !== false, iftarReminderMinutes: Number.isInteger(profile.iftarReminderMinutes) ? profile.iftarReminderMinutes : 0, methodId: profile.methodId || 'indonesia-kemenag-reference', corrections: { ...(profile.corrections || {}) } };
}

export async function listPersonalAdzanSubscribers() {
  const state = await readState();
  return Object.entries(state.users).filter(([, profile]) => profile?.adzanEnabled === true).map(([user, profile]) => ({ user, profile: { ...profile }, effective: getEffectiveAdzanProfileFromState(state, user), preferences: { audioEnabled: profile.adzanAudioEnabled !== false, audioPack: profile.audioPack || 'default', preAlertMinutes: Number.isInteger(profile.preAlertMinutes) ? profile.preAlertMinutes : 0, fridayReminderEnabled: profile.fridayReminderEnabled === true, fridayReminderTime: profile.fridayReminderTime || '11:00', ramadanReminderEnabled: profile.ramadanReminderEnabled === true, sahurReminderMinutes: Number.isInteger(profile.sahurReminderMinutes) ? profile.sahurReminderMinutes : 30, iftarReminderEnabled: profile.iftarReminderEnabled !== false, iftarReminderMinutes: Number.isInteger(profile.iftarReminderMinutes) ? profile.iftarReminderMinutes : 0 } }));
}

/** Durable at-most-once claim. Claim is written before WhatsApp delivery to prevent a restart
 * from replaying an event. A crash after claim but before send can miss that one notification. */
export async function claimPersonalAdzanEvent(user, prayer, date, scheduledAt) {
  const id = safeId(user);
  const key = `${id}:${date}:${prayer}`;
  return enqueueWrite(async () => {
    const state = await readState();
    state.personalAdzanEvents ||= {};
    if (state.personalAdzanEvents[key]) return false;
    state.personalAdzanEvents[key] = { user: id, prayer, date, scheduledAt, claimedAt: new Date().toISOString() };
    const cutoff = Date.now() - 45 * 86400_000;
    for (const [eventKey, event] of Object.entries(state.personalAdzanEvents)) {
      if (Date.parse(event.claimedAt || 0) < cutoff) delete state.personalAdzanEvents[eventKey];
    }
    await persistState(state);
    return true;
  });
}


const ADZAN_RETRY_DELAYS = Object.freeze([60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000]);
export async function enqueuePersonalAdzanDelivery({ user, prayer, date, scheduledAt, text, audioEnabled = true, audioPack = 'default', textOnly = false, now = Date.now() }) {
  const id = safeId(user);
  if (!id || !prayer || !date || !scheduledAt || typeof text !== 'string') throw new TypeError('Invalid personal Adzan delivery payload.');
  const key = `${id}:${date}:${prayer}`;
  return enqueueWrite(async () => {
    const state = await readState();
    state.personalAdzanEvents ||= {};
    const existing = state.personalAdzanEvents[key];
    if (existing && ['queued', 'sending', 'delivered', 'dead'].includes(existing.status)) return { created: false, key, status: existing.status };
    const retentionCutoff = Number(now) - 45 * 86400_000;
    for (const [oldKey, oldItem] of Object.entries(state.personalAdzanEvents)) {
      const completedAt = Date.parse(oldItem?.deliveredAt || oldItem?.failedAt || oldItem?.claimedAt || oldItem?.createdAt || 0);
      if (['delivered', 'dead'].includes(oldItem?.status) && completedAt && completedAt < retentionCutoff) delete state.personalAdzanEvents[oldKey];
    }
    state.personalAdzanEvents[key] = {
      key, user: id, prayer, date, scheduledAt, text,
      audioEnabled: Boolean(audioEnabled), audioPack: audioPack === 'custom' ? 'custom' : 'default', textOnly: Boolean(textOnly), status: 'queued', attempts: 0,
      nextAttemptAt: Number(now), createdAt: new Date(Number(now)).toISOString(), lastError: null
    };
    await persistState(state);
    return { created: true, key, status: 'queued' };
  });
}
export async function listDuePersonalAdzanDeliveries(now = Date.now(), limit = 100) {
  const state = await readState();
  return Object.values(state.personalAdzanEvents || {})
    .filter(item => item && ((item.status === 'queued' && Number(item.nextAttemptAt || 0) <= now) || (item.status === 'sending' && Number(item.leaseUntil || 0) <= now)))
    .sort((a, b) => Number(a.nextAttemptAt) - Number(b.nextAttemptAt))
    .slice(0, Math.max(1, Math.min(500, Number(limit) || 100)))
    .map(item => ({ ...item }));
}
export async function claimPersonalAdzanDelivery(key, { now = Date.now(), leaseMs = 120_000 } = {}) {
  return enqueueWrite(async () => {
    const state = await readState();
    const item = state.personalAdzanEvents?.[String(key)];
    if (!item) return null;
    const eligible = (item.status === 'queued' && Number(item.nextAttemptAt || 0) <= now) || (item.status === 'sending' && Number(item.leaseUntil || 0) <= now);
    if (!eligible) return null;
    item.status = 'sending';
    item.leaseUntil = now + Math.max(30_000, Math.min(10 * 60_000, Number(leaseMs) || 120_000));
    item.lastAttemptStartedAt = new Date(now).toISOString();
    await persistState(state);
    return { ...item };
  });
}
export async function finishPersonalAdzanDelivery(key, { success, error, now = Date.now() } = {}) {
  return enqueueWrite(async () => {
    const state = await readState();
    const item = state.personalAdzanEvents?.[String(key)];
    if (!item || item.status !== 'sending') return { updated: false, status: item?.status || 'missing' };
    delete item.leaseUntil;
    if (success) {
      item.status = 'delivered'; item.deliveredAt = new Date(now).toISOString(); item.lastError = null;
    } else {
      item.status = 'queued';
      item.attempts = Number(item.attempts || 0) + 1;
      item.lastError = String(error || 'Unknown WhatsApp delivery error').slice(0, 500);
      if (item.attempts >= 5) {
        item.status = 'dead'; item.failedAt = new Date(now).toISOString();
      } else {
        item.nextAttemptAt = now + ADZAN_RETRY_DELAYS[Math.min(item.attempts - 1, ADZAN_RETRY_DELAYS.length - 1)];
      }
    }
    await persistState(state);
    return { updated: true, status: item.status, attempts: item.attempts || 0, nextAttemptAt: item.nextAttemptAt || null };
  });
}
export async function getPersonalAdzanDeliveryStats() {
  const state = await readState();
  const stats = { queued: 0, delivered: 0, dead: 0, cancelled: 0, total: 0 };
  for (const item of Object.values(state.personalAdzanEvents || {})) {
    if (!item || !['queued', 'sending', 'delivered', 'dead', 'cancelled'].includes(item.status)) continue;
    stats[item.status === 'sending' ? 'queued' : item.status]++; stats.total++;
  }
  return stats;
}

export async function clearAdzanUserLocation(user) {
  const id = safeId(user);
  return enqueueWrite(async () => {
    const state = await readState();
    if (!state.users[id]) return false;
    delete state.users[id].location;
    delete state.users[id].timezone;
    cancelQueuedPersonalEvents(state, id, 'user-location-cleared');
    if (!Object.keys(state.users[id]).length) delete state.users[id];
    await persistState(state);
    return true;
  });
}
export async function clearAdzanOwnerDefault(user, isOwner = false) {
  if (!isOwner) throw new Error('Hanya owner yang dapat menghapus lokasi default.');
  return enqueueWrite(async () => {
    const state = await readState();
    state.ownerDefault = null;
    cancelQueuedPersonalEvents(state, null, 'owner-default-location-cleared');
    await persistState(state);
    return true;
  });
}
export async function getAdzanSettings(chat) {
  const state = await readState();
  const saved = state.groups[safeId(chat)] || {};
  return { enabled: false, timezone: DEFAULT_TIMEZONE, times: { ...DEFAULT_TIMES }, lastSent: {}, ...saved, times: { ...DEFAULT_TIMES, ...(saved.times || {}) } };
}
export async function updateAdzanSettings(chat, patch) {
  const id = safeId(chat);
  if (!id) throw new TypeError('WhatsApp chat ID is required.');
  return enqueueWrite(async () => {
    const state = await readState();
    const previous = await getAdzanSettings(id);
    state.groups[id] = { ...previous, ...patch, times: { ...previous.times, ...(patch.times || {}) } };
    await persistState(state);
    return state.groups[id];
  });
}
export async function dueAdzan(now = Date.now()) {
  return enqueueWrite(async () => {
    const state = await readState();
    const due = [];
    for (const [chat, settings] of Object.entries(state.groups)) {
      if (!settings.enabled) continue;
      const timezone = settings.timezone || DEFAULT_TIMEZONE;
      let parts;
      try {
        parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now)).map(part => [part.type, part.value]));
      } catch { continue; }
      const day = `${parts.year}-${parts.month}-${parts.day}`;
      const hhmm = `${parts.hour}:${parts.minute}`;
      for (const [name, time] of Object.entries(settings.times || {})) {
        if (time !== hhmm || settings.lastSent?.[name] === day) continue;
        settings.lastAttemptAt ||= {};
        if (now - Number(settings.lastAttemptAt[name] || 0) < 60_000) continue;
        settings.lastAttemptAt[name] = now;
        due.push({ chat, name, time, day, timezone });
      }
    }
    if (due.length) await persistState(state);
    return due;
  });
}
export async function markAdzanSent(chat, name, day, success = true) {
  return enqueueWrite(async () => {
    const state = await readState();
    const settings = state.groups[safeId(chat)];
    if (!settings) return false;
    if (success) { settings.lastSent ||= {}; settings.lastSent[name] = day; }
    await persistState(state);
    return true;
  });
}
export { DEFAULT_TIMES, DEFAULT_TIMEZONE, FILE as ADZAN_PROFILE_FILE, BACKUP as ADZAN_PROFILE_BACKUP, validCoordinates, validTimezone };

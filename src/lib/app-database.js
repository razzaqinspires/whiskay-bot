import { mkdir, readFile, writeFile, rename, copyFile, access } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.env.WHISKAY_DATA_DIR || './data');
const FILE = path.join(ROOT, 'app-database.json');
const BACKUP = `${FILE}.bak`;
const EMPTY = () => ({ schemaVersion: 1, users: {}, anonymous: { queue: [], pairs: {} }, games: {}, werewolfRooms: {}, blockedUsers: {}, topups: {}, updatedAt: new Date().toISOString() });
let queue = Promise.resolve();

async function readCandidate(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.users || typeof parsed.users !== 'object') throw new Error('invalid database shape');
    return { ...EMPTY(), ...parsed, users: parsed.users, anonymous: parsed.anonymous || { queue: [], pairs: {} }, games: parsed.games || {}, werewolfRooms: parsed.werewolfRooms || {}, blockedUsers: parsed.blockedUsers || {}, topups: parsed.topups || {} };
  } catch { return null; }
}
export async function readAppDatabase() {
  const primary = await readCandidate(FILE);
  if (primary) return structuredClone(primary);
  const backup = await readCandidate(BACKUP);
  if (backup) return structuredClone(backup);
  return EMPTY();
}
export async function mutateAppDatabase(mutator) {
  const run = queue.then(async () => {
    await mkdir(ROOT, { recursive: true, mode: 0o700 });
    let current = await readCandidate(FILE);
    const primaryValid = Boolean(current);
    if (!current) current = await readCandidate(BACKUP);
    const backupValid = Boolean(current);
    if (!current) current = EMPTY();
    const draft = structuredClone(current);
    const result = await mutator(draft);
    draft.updatedAt = new Date().toISOString();
    const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(draft, null, 2), { encoding: 'utf8', mode: 0o600 });
    // Preserve only a valid primary as backup. If both are corrupt, quarantine the
    // primary instead of overwriting evidence or silently destroying the previous backup.
    if (primaryValid) {
      try { await copyFile(FILE, BACKUP); } catch {}
    } else {
      try {
        await access(FILE);
        if (backupValid) await rename(FILE, `${FILE}.corrupt-${Date.now()}`);
        else await rename(FILE, `${FILE}.corrupt-${Date.now()}`);
      } catch {}
    }
    await rename(tmp, FILE);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}
export function normalizeUserId(value) {
  const s = String(value || '').trim();
  if (!s || s.endsWith('@g.us') || s.endsWith('@newsletter') || s === 'status@broadcast') return '';
  return s.split(':')[0];
}
export async function observeUser({ jid, pushName = '', chat = '', isGroup = false, now = Date.now() }) {
  const id = normalizeUserId(jid);
  if (!id) return null;
  return mutateAppDatabase(db => {
    const prior = db.users[id] || { id, registered: false, createdAt: now, balance: 0, warnings: 0, banned: false };
    prior.pushName = String(pushName || prior.pushName || 'Pengguna').slice(0, 80);
    prior.lastSeenAt = now;
    prior.lastChat = String(chat || '').slice(0, 140);
    prior.lastSeenInGroup = Boolean(isGroup);
    prior.messageCount = Math.max(0, Number(prior.messageCount) || 0) + 1;
    db.users[id] = prior;
    return structuredClone(prior);
  });
}
export async function getUser(id) {
  const db = await readAppDatabase();
  return db.users[normalizeUserId(id)] || null;
}
export async function registerUser(id, name = '') {
  const key = normalizeUserId(id);
  if (!key) throw new Error('ID pengguna tidak valid.');
  return mutateAppDatabase(db => {
    const now = Date.now();
    const user = db.users[key] || { id: key, createdAt: now, balance: 0, messageCount: 0, warnings: 0, banned: false };
    user.id = key; user.pushName = String(name || user.pushName || 'Pengguna').slice(0, 80);
    user.registered = true; user.registeredAt ||= now; user.lastSeenAt = now;
    db.users[key] = user;
    return structuredClone(user);
  });
}
export async function getUserStats() {
  const db = await readAppDatabase();
  const users = Object.values(db.users);
  return { total: users.length, registered: users.filter(u => u.registered === true).length, banned: users.filter(u => u.banned === true).length };
}
export async function updateUser(id, patch) {
  const key = normalizeUserId(id);
  return mutateAppDatabase(db => {
    if (!db.users[key]) db.users[key] = { id: key, registered: false, createdAt: Date.now(), balance: 0, warnings: 0, messageCount: 0, banned: false };
    Object.assign(db.users[key], patch);
    return structuredClone(db.users[key]);
  });
}

export function isUserBanActive(user, now = Date.now()) {
  if (!user?.banned) return false;
  const until = Number(user.banUntil || 0);
  // Legacy banned=true rows without banUntil are intentionally treated as permanent.
  return !until || until > Number(now);
}

/** Clear only timed bans that have expired. Legacy banned=true rows without banUntil remain permanent. */
export async function clearExpiredUserBan(id, now = Date.now()) {
  const key = normalizeUserId(id);
  if (!key) return { user: null, expired: false };
  // Fast path avoids a database write for nearly every ordinary command.
  const snapshot = await getUser(key);
  if (!snapshot || !snapshot.banned || isUserBanActive(snapshot, now)) return { user: snapshot, expired: false };
  // Re-check inside the serialized mutation: an owner may have renewed the ban
  // between the read and write, and expiry cleanup must not clear that newer ban.
  return mutateAppDatabase(db => {
    const current = db.users[key];
    if (!current || !current.banned || isUserBanActive(current, now)) {
      return { user: current ? structuredClone(current) : null, expired: false };
    }
    current.banned = false;
    current.banUntil = 0;
    current.banReason = '';
    current.unbannedAt = Number(now);
    current.unbannedBy = 'automatic-expiry';
    return { user: structuredClone(current), expired: true };
  });
}

export async function banUser(id, { until = 0, reason = '', by = '' } = {}) {
  const key = normalizeUserId(id);
  if (!key) throw new Error('ID pengguna tidak valid.');
  const expiry = Number(until || 0);
  if (expiry && (!Number.isFinite(expiry) || expiry <= Date.now())) throw new Error('Waktu kedaluwarsa ban tidak valid.');
  return mutateAppDatabase(db => {
    const user = db.users[key];
    if (!user) throw new Error('Pengguna belum tercatat di database Whiskay.');
    user.banned = true;
    user.banUntil = expiry || 0;
    user.banReason = String(reason || '').trim().replace(/[\r\n]/g, ' ').slice(0, 240);
    user.bannedBy = String(by || '').slice(0, 120);
    user.bannedAt = Date.now();
    return structuredClone(user);
  });
}

export async function unbanUser(id, { by = '' } = {}) {
  const key = normalizeUserId(id);
  if (!key) throw new Error('ID pengguna tidak valid.');
  return mutateAppDatabase(db => {
    const user = db.users[key];
    if (!user) throw new Error('Pengguna belum tercatat di database Whiskay.');
    const wasBanned = Boolean(user.banned);
    user.banned = false;
    user.banUntil = 0;
    user.banReason = '';
    user.unbannedAt = Date.now();
    user.unbannedBy = String(by || '').slice(0, 120);
    return { user: structuredClone(user), wasBanned };
  });
}

export async function deleteUserOwnerMetadata(id, field) {
  const key = normalizeUserId(id);
  const allowed = new Set(['ownerNickname', 'ownerNote']);
  if (!key || !allowed.has(field)) throw new Error('Field metadata owner tidak diizinkan.');
  return mutateAppDatabase(db => {
    const user = db.users[key];
    if (!user) throw new Error('Pengguna belum tercatat di database Whiskay.');
    const existed = Object.hasOwn(user, field);
    delete user[field];
    return { user: structuredClone(user), existed, field };
  });
}
export async function creditBalance(id, amount, meta = {}) {
  const value = Number(amount);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Nominal harus berupa bilangan bulat positif.');
  const key = normalizeUserId(id);
  return mutateAppDatabase(db => {
    const user = db.users[key];
    if (!user || user.registered !== true || user.banned) throw new Error('Akun harus terdaftar dan tidak diblokir.');
    user.balance = Math.max(0, Number(user.balance) || 0) + value;
    user.balanceUpdatedAt = Date.now();
    const tx = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    db.topups[tx] = { id: tx, user: key, amount: value, status: 'credited', createdAt: Date.now(), ...meta };
    return { user: structuredClone(user), transaction: structuredClone(db.topups[tx]) };
  });
}
export async function createTopup(id, amount, method = 'manual') {
  const value = Number(amount);
  if (!Number.isSafeInteger(value) || value < 1000 || value > 100000000) throw new Error('Top-up minimal Rp1.000 dan maksimal Rp100.000.000.');
  const key = normalizeUserId(id);
  return mutateAppDatabase(db => {
    if (!db.users[key] || db.users[key].registered !== true) throw new Error('Daftar terlebih dahulu dengan .daftar.');
    const tx = `TOP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    db.topups[tx] = { id: tx, user: key, amount: value, method: String(method).slice(0, 40), status: 'pending', createdAt: Date.now() };
    return structuredClone(db.topups[tx]);
  });
}
export async function approveTopup(txId, ownerId) {
  return mutateAppDatabase(db => {
    const tx = db.topups[String(txId || '')];
    if (!tx || tx.status !== 'pending') throw new Error('Transaksi tidak ditemukan atau sudah diproses.');
    const user = db.users[tx.user];
    if (!user || user.registered !== true) throw new Error('Pengguna top-up tidak ditemukan/terdaftar.');
    user.balance = Math.max(0, Number(user.balance) || 0) + tx.amount;
    user.balanceUpdatedAt = Date.now();
    tx.status = 'approved'; tx.approvedAt = Date.now(); tx.approvedBy = String(ownerId || '');
    return { user: structuredClone(user), transaction: structuredClone(tx) };
  });
}
export async function getPendingTopups() {
  const db = await readAppDatabase();
  return Object.values(db.topups).filter(t => t.status === 'pending').map(t => structuredClone(t));
}
export async function chargeBalance(id, amount, reason = 'usage') {
  const value = Number(amount);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Nominal tidak valid.');
  const key = normalizeUserId(id);
  return mutateAppDatabase(db => {
    const user = db.users[key];
    if (!user || user.registered !== true || user.banned) throw new Error('Akun belum terdaftar atau diblokir.');
    if ((Number(user.balance) || 0) < value) throw new Error('Saldo tidak cukup. Gunakan .topup untuk mengisi saldo.');
    user.balance -= value; user.balanceUpdatedAt = Date.now();
    const tx = `USE-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    db.topups[tx] = { id: tx, user: key, amount: value, status: 'charged', reason: String(reason).slice(0, 100), createdAt: Date.now() };
    return { user: structuredClone(user), transaction: structuredClone(db.topups[tx]) };
  });
}
export async function addAnonymousToQueue(id) {
  const key = normalizeUserId(id);
  return mutateAppDatabase(db => {
    if (!db.users[key]?.registered || db.users[key]?.banned) throw new Error('Daftar terlebih dahulu.');
    const anon = db.anonymous;
    if (anon.pairs[key]) return { status: 'paired', partner: anon.pairs[key] };
    anon.queue = anon.queue.filter(x => x !== key);
    const partnerIndex = anon.queue.findIndex(x => x !== key && !anon.pairs[x] && !db.users[x]?.banned);
    if (partnerIndex < 0) { anon.queue.push(key); return { status: 'waiting' }; }
    const partner = anon.queue.splice(partnerIndex, 1)[0];
    anon.pairs[key] = partner; anon.pairs[partner] = key;
    return { status: 'paired', partner };
  });
}
export async function getAnonymousPartner(id) {
  const db = await readAppDatabase();
  return db.anonymous.pairs[normalizeUserId(id)] || '';
}
export async function stopAnonymous(id) {
  const key = normalizeUserId(id);
  return mutateAppDatabase(db => {
    const partner = db.anonymous.pairs[key];
    delete db.anonymous.pairs[key];
    if (partner) delete db.anonymous.pairs[partner];
    db.anonymous.queue = db.anonymous.queue.filter(x => x !== key);
    if (partner) db.anonymous.queue = db.anonymous.queue.filter(x => x !== partner);
    return { partner: partner || '', waiting: false };
  });
}
export async function getAnonymousQueueStatus(id) {
  const db = await readAppDatabase(); const key = normalizeUserId(id);
  return { waiting: db.anonymous.queue.includes(key), partner: db.anonymous.pairs[key] || '' };
}

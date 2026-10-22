import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const DATA_DIR = path.resolve('data');
const ENERGY_FILE = path.join(DATA_DIR, 'energy-ledger.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'runtime-switches.json');
const PAYMENT_FILE = path.join(DATA_DIR, 'payment-config.json');
const HITS_FILE = path.join(DATA_DIR, 'command-hits.json');
const DAY = 86_400_000;
const MAX_USERS = 5000;
let writeQueue = Promise.resolve();
let mutationQueue = Promise.resolve();
let switchCache = null;
let switchCacheAt = 0;
function withMutationLock(fn) { const run = mutationQueue.then(fn, fn); mutationQueue = run.catch(() => {}); return run; }
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
async function readJson(file, fallback) { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; } }
async function atomicJson(file, value) {
  const task = async () => { await mkdir(DATA_DIR, { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; await writeFile(tmp, JSON.stringify(value, null, 2)); await rename(tmp, file); };
  writeQueue = writeQueue.then(task, task); return writeQueue;
}
const normUser = id => String(id || 'unknown').replace(/[^a-zA-Z0-9@._:-]/g, '').slice(0, 180) || 'unknown';
export function complexityScore(command, previous = []) {
  const text = String(command || '').slice(0, 1200).toLowerCase();
  const tokens = text.match(/[\p{L}\p{N}_]+|[^\s]/gu) || [];
  const unique = new Set(tokens);
  const math = (text.match(/[=+*/^<>]|\b(?:calculate|hitung|solve|integral|derivative|persamaan)\b/g) || []).length;
  const quoted = (text.match(/["'`]/g) || []).length;
  const tokenEntropy = tokens.length ? unique.size / tokens.length : 0;
  const similarity = previous.slice(-5).reduce((best, item) => Math.max(best, jaccard(tokens, String(item).toLowerCase().match(/[\p{L}\p{N}_]+|[^\s]/gu) || [])), 0);
  // Low-allocation O(n) scoring: bounded input, token-set similarity, no model call or background worker.
  const raw = 0.45 + Math.min(tokens.length, 160) * 0.012 + Math.min(math, 20) * 0.11 + Math.min(quoted, 12) * 0.025 + tokenEntropy * 0.45 - similarity * 0.22;
  return Math.round(clamp(raw, 0.25, 8.75) * 100) / 100;
}
function jaccard(a, b) { const aa = new Set(a), bb = new Set(b); if (!aa.size && !bb.size) return 1; let intersection = 0; for (const x of aa) if (bb.has(x)) intersection++; return intersection / Math.max(1, aa.size + bb.size - intersection); }
export async function getEnergy(userId) {
  const all = await readJson(ENERGY_FILE, {}), key = normUser(userId), u = all[key] || {};
  return { energy: clamp(Number(u.energy ?? 100), 0, 100), lastChargeAt: Number(u.lastChargeAt || 0), premiumUntil: Number(u.premiumUntil || 0), commands: Number(u.commands || 0), totalSpent: Number(u.totalSpent || 0), lastCommands: Array.isArray(u.lastCommands) ? u.lastCommands.slice(-5) : [] };
}
async function consumeEnergyUnlocked(userId, commandText, fixedCost = null) {
  const all = await readJson(ENERGY_FILE, {}), key = normUser(userId), u = all[key] || { energy: 100, lastChargeAt: 0, premiumUntil: 0, commands: 0, totalSpent: 0, lastCommands: [] };
  const cost = fixedCost !== null && fixedCost !== undefined && Number.isFinite(Number(fixedCost)) ? Math.round(clamp(Number(fixedCost), 0.05, 10) * 100) / 100 : complexityScore(commandText, u.lastCommands || []);
  const actualCost = Math.round(Math.min(clamp(Number(u.energy ?? 100), 0, 100), cost) * 100) / 100;
  u.energy = Math.round(clamp(Number(u.energy ?? 100) - actualCost, 0, 100) * 100) / 100;
  u.commands = Number(u.commands || 0) + 1; u.totalSpent = Math.round((Number(u.totalSpent || 0) + actualCost) * 100) / 100;
  u.lastCommands = [...(u.lastCommands || []).slice(-4), String(commandText || '').slice(0, 120)];
  all[key] = u;
  const keys = Object.keys(all); if (keys.length > MAX_USERS) for (const old of keys.slice(0, keys.length - MAX_USERS)) delete all[old];
  await atomicJson(ENERGY_FILE, all);
  const premium = Number(u.premiumUntil || 0) > Date.now();
  return { energy: u.energy, cost: actualCost, estimatedCost: cost, premium, commands: u.commands, totalSpent: u.totalSpent };
}
async function chargeEnergyUnlocked(userId, now = Date.now(), fast = false) {
  const all = await readJson(ENERGY_FILE, {}), key = normUser(userId), u = all[key] || { energy: 100, lastChargeAt: 0, premiumUntil: 0, commands: 0, totalSpent: 0, lastCommands: [] };
  const premium = Number(u.premiumUntil || 0) > now;
  if (fast && !premium) return { ok: false, reason: 'fast-premium-only', energy: clamp(Number(u.energy ?? 100), 0, 100) };
  if (!fast && now - Number(u.lastChargeAt || 0) < DAY) return { ok: false, reason: 'cooldown', energy: clamp(Number(u.energy ?? 100), 0, 100), nextAt: Number(u.lastChargeAt) + DAY };
  if (fast && !premium) return { ok: false, reason: 'fast-premium-only', energy: Number(u.energy ?? 100) };
  u.energy = fast ? 100 : Math.min(100, Number(u.energy ?? 100) + 40); u.lastChargeAt = now; all[key] = u; await atomicJson(ENERGY_FILE, all);
  return { ok: true, energy: u.energy, added: fast ? 100 : 40, fast, premium };
}
async function grantPremiumUnlocked(userId, days = 30, now = Date.now()) {
  const d = clamp(Math.floor(Number(days) || 0), 1, 30), all = await readJson(ENERGY_FILE, {}), key = normUser(userId), u = all[key] || { energy: 100, lastChargeAt: 0, commands: 0, totalSpent: 0, lastCommands: [] };
  u.premiumUntil = Math.min(now + 30 * DAY, Math.max(now, Number(u.premiumUntil || 0)) + d * DAY); all[key] = u; await atomicJson(ENERGY_FILE, all); return u.premiumUntil;
}
export async function getRuntimeSwitches() { const now=Date.now(); if(switchCache && now-switchCacheAt<2000)return {...switchCache}; switchCache={antiSpam:true,globalCooldown:true,...(await readJson(SETTINGS_FILE,{}))};switchCacheAt=now;return {...switchCache}; }
async function setRuntimeSwitchUnlocked(name, enabled) { const current = await getRuntimeSwitches(); if (!['antiSpam','globalCooldown'].includes(name)) throw new Error('Unknown runtime switch'); current[name] = Boolean(enabled); await atomicJson(SETTINGS_FILE, current); switchCache={...current};switchCacheAt=Date.now();return current; }
export async function getPaymentConfig() { return readJson(PAYMENT_FILE, { bank: [], ewallet: [], qrisPath: '', basePrice: 1000, dailyRate: 1.01, priceEpoch: Date.now() }); }
export async function getPremiumPrice(now = Date.now()) { const c = await getPaymentConfig(); const base = clamp(Number(c.basePrice ?? c.pricePerDay ?? 1000), 1, 100000000); const rate = clamp(Number(c.dailyRate ?? 1.01), 0.8, 1.2); const days = Math.max(0, Math.min(3650, Math.floor((now - Number(c.priceEpoch || now)) / DAY))); return clamp(Math.round(base * Math.pow(rate, days)), 1, 100000000000); }
async function setPaymentConfigUnlocked(patch) { const current = await getPaymentConfig(); const next = { ...current, ...patch }; await atomicJson(PAYMENT_FILE, next); return next; }
async function recordHitUnlocked(userId, command) { const all = await readJson(HITS_FILE, { total: 0, commands: {}, users: {} }), u = normUser(userId), c = String(command || 'unknown').toLowerCase().slice(0, 64); all.total++; all.commands[c] = Number(all.commands[c] || 0) + 1; if (!all.users[u]) all.users[u] = { total: 0, commands: {} }; all.users[u].total++; all.users[u].commands[c] = Number(all.users[u].commands[c] || 0) + 1; await atomicJson(HITS_FILE, all); return all; }
export async function getHits() { return readJson(HITS_FILE, { total: 0, commands: {}, users: {} }); }
export async function getEnergyRuntimeInfo() { const m = process.memoryUsage(); return { rssMB: Math.round(m.rss / 1048576), heapUsedMB: Math.round(m.heapUsed / 1048576), platform: `${os.platform()} ${os.arch()}`, node: process.versions.node, worker: 'inline-bounded-O(n)', pendingWrites: writeQueue === Promise.resolve() ? 0 : 1 }; }
export function energyFooter(receipt) { return receipt ? `\n\n-${receipt.cost.toFixed(2).replace('.', ',')}% baterai digunakan. 🔋 ${receipt.energy.toFixed(2).replace('.', ',')}% tersisa.` : ''; }

// Serialize read-modify-write transactions in-process so concurrent messages cannot overwrite one another.
export const consumeEnergy = (...args) => withMutationLock(() => consumeEnergyUnlocked(...args));
export const chargeEnergy = (...args) => withMutationLock(() => chargeEnergyUnlocked(...args));
export const grantPremium = (...args) => withMutationLock(() => grantPremiumUnlocked(...args));
export const setRuntimeSwitch = (...args) => withMutationLock(() => setRuntimeSwitchUnlocked(...args));
export const setPaymentConfig = (...args) => withMutationLock(() => setPaymentConfigUnlocked(...args));
export const recordHit = (...args) => withMutationLock(() => recordHitUnlocked(...args));

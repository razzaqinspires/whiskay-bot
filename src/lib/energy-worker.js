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
const MAX_MODCOIN_HISTORY = 100;
let writeQueue = Promise.resolve();
let pendingWriteCount = 0;
let mutationQueue = Promise.resolve();
let switchCache = null;
let switchCacheAt = 0;
function withMutationLock(fn) { const run = mutationQueue.then(fn, fn); mutationQueue = run.catch(() => {}); return run; }
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
async function readJson(file, fallback) { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; } }
async function atomicJson(file, value) {
  const task = async () => { await mkdir(DATA_DIR, { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; await writeFile(tmp, JSON.stringify(value, null, 2)); await rename(tmp, file); };
  pendingWriteCount++;
  writeQueue = writeQueue.then(task, task).finally(() => { pendingWriteCount = Math.max(0, pendingWriteCount - 1); });
  return writeQueue;
}
const normUser = id => String(id || 'unknown').replace(/[^a-zA-Z0-9@._:-]/g, '').slice(0, 180) || 'unknown';

/** Build a bounded, non-secret Coin Mod audit entry. Balance changes remain in the same ledger write. */
export function makeModCoinEntry({ delta, balance, reason = 'unspecified', reference = '', at = Date.now() } = {}) {
  const amount = Math.trunc(Number(delta));
  const nextBalance = Math.trunc(Number(balance));
  if (!Number.isSafeInteger(amount) || amount === 0 || !Number.isSafeInteger(nextBalance) || nextBalance < 0) {
    throw new TypeError('Invalid Mod Coin transaction values');
  }
  return {
    at: Math.max(0, Math.trunc(Number(at) || Date.now())),
    delta: amount,
    balance: nextBalance,
    reason: String(reason || 'unspecified').replace(/[^a-zA-Z0-9._:-]/g, '-').slice(0, 48),
    ...(reference ? { reference: String(reference).replace(/[^a-zA-Z0-9._:-]/g, '-').slice(0, 80) } : {})
  };
}

function appendModCoinHistory(user, entry) {
  user.modCoinHistory = [...(Array.isArray(user.modCoinHistory) ? user.modCoinHistory : []), entry].slice(-MAX_MODCOIN_HISTORY);
}

export async function getModCoinHistory(userId, limit = 10) {
  const all = await readJson(ENERGY_FILE, {}), user = all[normUser(userId)] || {};
  const safeLimit = clamp(Math.floor(Number(limit) || 10), 1, 50);
  return {
    balance: Math.max(0, Math.floor(Number(user.modCoins || 0))),
    transactions: (Array.isArray(user.modCoinHistory) ? user.modCoinHistory : []).slice(-safeLimit).reverse()
  };
}
export function complexityScore(command, previous = []) {
  // Deterministic, bounded, low-allocation estimator. It is a heuristic cost model,
  // not an LLM call: token shape, operators, text length, uniqueness and similarity
  // all contribute. A small stable lexical term prevents one-word commands collapsing
  // to the same rounded value while repeated identical prompts still receive a discount.
  const text = String(command || '').slice(0, 1200).trim().toLowerCase();
  const tokens = text.match(/[\p{L}\p{N}_]+|[^\s]/gu) || [];
  const unique = new Set(tokens);
  const math = (text.match(/[=+*/^<>%()-]|\b(?:calculate|hitung|solve|integral|derivative|persamaan|rumus|equation)\b/g) || []).length;
  const quoted = (text.match(/["'`]/g) || []).length;
  const tokenEntropy = tokens.length ? unique.size / tokens.length : 0;
  const charClasses = new Set([...text].map(c => /[a-z]/.test(c) ? 'l' : /[0-9]/.test(c) ? 'n' : /\s/.test(c) ? 's' : 'p')).size;
  const similarity = previous.slice(-5).reduce((best, item) => Math.max(best, jaccard(tokens, String(item).toLowerCase().match(/[\p{L}\p{N}_]+|[^\s]/gu) || [])), 0);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  const lexical = ((hash >>> 0) % 19) / 100;
  const raw = 0.38 + Math.min(tokens.length, 160) * 0.018 + Math.min(math, 20) * 0.105 + Math.min(quoted, 12) * 0.035 + tokenEntropy * 0.42 + charClasses * 0.045 + lexical - similarity * 0.24;
  return Math.round(clamp(raw, 0.25, 8.75) * 100) / 100;
}
function jaccard(a, b) { const aa = new Set(a), bb = new Set(b); if (!aa.size && !bb.size) return 1; let intersection = 0; for (const x of aa) if (bb.has(x)) intersection++; return intersection / Math.max(1, aa.size + bb.size - intersection); }
function resolveCharging(u, now = Date.now()) {
  if (!u?.isCharging) return false;
  const cap = clamp(Number(u.maxBatteryCapacity || 100), 100, 10000), volts = clamp(Number(u.currentVoltSpeed || 5), 5, 33);
  const started = Number(u.chargingStartedAt || now), startEnergy = clamp(Number(u.chargingStartEnergy ?? u.energy ?? 0), 0, cap);
  const rate = (volts / 5) / 252000;
  const elapsed = Math.max(0, now - started), duration = Math.max(0, cap - startEnergy) / rate;
  u.energy = Math.round(clamp(startEnergy + elapsed * rate, 0, cap) * 100) / 100;
  u.chargingEndsAt = started + duration;
  if (u.energy >= cap || now >= u.chargingEndsAt) {
    u.energy = cap; u.isCharging = false; u.chargingStartedAt = 0; u.chargingStartEnergy = cap; u.chargingEndsAt = 0; u.lastChargeAt = now;
    return true;
  }
  return false;
}
export async function getEnergy(userId) {
  const all = await readJson(ENERGY_FILE, {}), key = normUser(userId), u = all[key] || {};
  const completed = resolveCharging(u);
  if (completed) await atomicJson(ENERGY_FILE, all);
  const maxBatteryCapacity = clamp(Number(u.maxBatteryCapacity || 100), 100, 10000);
  const energy = clamp(Number(u.energy ?? 100), 0, maxBatteryCapacity);
  return { energy, maxBatteryCapacity, currentVoltSpeed: clamp(Number(u.currentVoltSpeed || 5), 5, 33), modCoins: Math.max(0, Math.floor(Number(u.modCoins || 0))), isCharging: Boolean(u.isCharging), chargingEndsAt: Number(u.chargingEndsAt || 0), chargingStartedAt: Number(u.chargingStartedAt || 0), lastChargeAt: Number(u.lastChargeAt || 0), premiumUntil: Number(u.premiumUntil || 0), commands: Number(u.commands || 0), totalSpent: Number(u.totalSpent || 0), lastCommands: Array.isArray(u.lastCommands) ? u.lastCommands.slice(-5) : [], limit: clamp(Number(u.limit ?? 20), 0, 100), limitResetAt: Number(u.limitResetAt || 0) };
}
export async function isCharging(userId) { return (await getEnergy(userId)).isCharging; }
export async function startCharging(userId, now = Date.now(), options = {}) {
  return withMutationLock(async () => {
    const all = await readJson(ENERGY_FILE, {}), key = normUser(userId), u = all[key] || { energy: 100, lastChargeAt: 0, premiumUntil: 0, commands: 0, totalSpent: 0, lastCommands: [] };
    resolveCharging(u, now);
    if (u.isCharging) return { ok: false, reason: 'already-charging', energy: Number(u.energy || 0), endsAt: Number(u.chargingEndsAt || 0) };
    const volts = clamp(Number(options.volts || 5), 5, 33);
    const capacity = clamp(Number(u.maxBatteryCapacity || 100), 100, 10000);
    if (volts > 5 && Number(u.premiumUntil || 0) <= now) return { ok: false, reason: 'premium-required', energy: Number(u.energy || 0) };
    const energy = clamp(Number(u.energy ?? 100), 0, capacity);
    if (energy >= capacity) return { ok: false, reason: 'full', energy: capacity };
    u.currentVoltSpeed = volts;
    const duration = Math.ceil((capacity - energy) * 252000 * (5 / volts));
    u.isCharging = true; u.chargingStartedAt = now; u.chargingStartEnergy = energy; u.chargingEndsAt = now + duration;
    all[key] = u; await atomicJson(ENERGY_FILE, all);
    return { ok: true, energy, capacity, volts, endsAt: u.chargingEndsAt, durationMs: duration };
  });
}
export async function addModCoins(userId, amount, options = {}) {
  const value = Math.floor(Number(amount)); if (!Number.isFinite(value) || value < 1 || value > 1000000000) return { ok:false, reason:'invalid-amount' };
  return withMutationLock(async () => {
    const all=await readJson(ENERGY_FILE,{}), key=normUser(userId), u=all[key]||{energy:100};
    const current=Math.max(0,Math.floor(Number(u.modCoins||0)));
    if (current + value > Number.MAX_SAFE_INTEGER) return { ok:false, reason:'balance-overflow', modCoins:current };
    u.modCoins=current+value;
    appendModCoinHistory(u, makeModCoinEntry({delta:value,balance:u.modCoins,reason:options.reason||'admin-credit',reference:options.reference,at:options.at}));
    all[key]=u; await atomicJson(ENERGY_FILE,all); return {ok:true,modCoins:u.modCoins};
  });
}
export async function spendModCoins(userId, amount, options = {}) {
  const value = Math.floor(Number(amount)); if (!Number.isFinite(value) || value < 1) return {ok:false,reason:'invalid-amount'};
  return withMutationLock(async () => {
    const all=await readJson(ENERGY_FILE,{}), key=normUser(userId), u=all[key]||{energy:100};
    const coins=Math.max(0,Math.floor(Number(u.modCoins||0)));
    if(coins<value)return {ok:false,reason:'insufficient-coins',modCoins:coins};
    u.modCoins=coins-value;
    appendModCoinHistory(u, makeModCoinEntry({delta:-value,balance:u.modCoins,reason:options.reason||'spend',reference:options.reference,at:options.at}));
    all[key]=u; await atomicJson(ENERGY_FILE,all); return {ok:true,modCoins:u.modCoins};
  });
}
export async function upgradeBatteryCapacity(userId, increment=50, cost=100) {
  return withMutationLock(async () => { const all=await readJson(ENERGY_FILE,{}), key=normUser(userId), u=all[key]||{energy:100}; const coins=Math.max(0,Math.floor(Number(u.modCoins||0))), price=Math.max(1,Math.floor(Number(cost)||100)); if(coins<price)return {ok:false,reason:'insufficient-coins',modCoins:coins}; const current=clamp(Number(u.maxBatteryCapacity||100),100,10000), next=Math.min(10000,current+Math.max(50,Math.floor(Number(increment)||50))); if(next===current)return {ok:false,reason:'capacity-limit',capacity:current}; u.modCoins=coins-price;u.maxBatteryCapacity=next;appendModCoinHistory(u, makeModCoinEntry({delta:-price,balance:u.modCoins,reason:'battery-capacity-upgrade'}));all[key]=u;await atomicJson(ENERGY_FILE,all);return {ok:true,capacity:next,modCoins:u.modCoins}; });
}
export async function resetBattery(userId, energy = 100) {
  return withMutationLock(async () => {
    const all = await readJson(ENERGY_FILE, {}), key = normUser(userId);
    const u = all[key] || { energy: 100 };
    const capacity = clamp(Number(u.maxBatteryCapacity || 100), 100, 10000);
    u.energy = clamp(Number(energy), 0, capacity);
    u.isCharging = false; u.chargingStartedAt = 0; u.chargingStartEnergy = u.energy; u.chargingEndsAt = 0;
    u.currentVoltSpeed = 5; all[key] = u; await atomicJson(ENERGY_FILE, all);
    return { ok: true, user: key, energy: u.energy, capacity, modCoins: Math.max(0, Math.floor(Number(u.modCoins || 0))) };
  });
}
export async function listEnergyUsers(limit=100, offset=0) {
  const all=await readJson(ENERGY_FILE,{}); const rows=Object.entries(all).map(([user,u])=>({user,energy:clamp(Number(u.energy??100),0,clamp(Number(u.maxBatteryCapacity||100),100,10000)),capacity:clamp(Number(u.maxBatteryCapacity||100),100,10000),volts:clamp(Number(u.currentVoltSpeed||5),5,33),isCharging:Boolean(u.isCharging),premiumUntil:Number(u.premiumUntil||0)}));
  return { total:rows.length, users:rows.slice(Math.max(0,offset),Math.max(0,offset)+Math.min(100,Math.max(1,limit))) };
}
export async function stopCharging(userId, now = Date.now()) {
  return withMutationLock(async () => {
    const all = await readJson(ENERGY_FILE, {}), key = normUser(userId), u = all[key];
    if (!u?.isCharging) return { ok: false, reason: 'not-charging', energy: clamp(Number(u?.energy ?? 100), 0, clamp(Number(u?.maxBatteryCapacity || 100),100,10000)) };
    resolveCharging(u, now); u.isCharging = false; u.chargingStartedAt = 0; u.chargingStartEnergy = Number(u.energy || 0); u.chargingEndsAt = 0; all[key] = u; await atomicJson(ENERGY_FILE, all);
    return { ok: true, energy: clamp(Number(u.energy || 0), 0, clamp(Number(u.maxBatteryCapacity || 100),100,10000)) };
  });
}
let regenTimer = null;
let regenTickRunning = false;
export async function setAutoRegen(enabled) {
  await withMutationLock(async () => { const switches = await readJson(SETTINGS_FILE, {}); switches.autoRegen = Boolean(enabled); await atomicJson(SETTINGS_FILE, switches); switchCache = { antiSpam: true, globalCooldown: true, ...switches }; switchCacheAt = Date.now(); });
  if (enabled) startAutoRegenWorker(); else stopAutoRegenWorker();
  return Boolean(enabled);
}
export function startAutoRegenWorker() {
  if (regenTimer) return;
  regenTimer = setInterval(async () => {
    // setInterval must not enqueue another database scan while the prior one is still running.
    if (regenTickRunning) return;
    regenTickRunning = true;
    try {
      await withMutationLock(async () => {
        const all = await readJson(ENERGY_FILE, {}); let changed = false;
        for (const u of Object.values(all)) {
          if (u?.isCharging) { changed = resolveCharging(u) || changed; continue; }
          const capacity = clamp(Number(u.maxBatteryCapacity || 100), 100, 10000); const before = clamp(Number(u.energy ?? 100), 0, capacity), after = Math.min(capacity, Math.round((before + 0.01) * 100) / 100);
          if (after !== before) { u.energy = after; changed = true; }
        }
        if (changed) await atomicJson(ENERGY_FILE, all);
      });
    } catch (e) { console.error('[AUTO REGEN]', e?.message || e); }
    finally { regenTickRunning = false; }
  }, 1000);
  regenTimer.unref?.();
}
export function stopAutoRegenWorker() { if (regenTimer) clearInterval(regenTimer); regenTimer = null; }
readJson(SETTINGS_FILE, {}).then(s => { if (s?.autoRegen) startAutoRegenWorker(); }).catch(() => {});
async function consumeEnergyUnlocked(userId, commandText, fixedCost = null) {
  const all = await readJson(ENERGY_FILE, {}), key = normUser(userId), u = all[key] || { energy: 100, lastChargeAt: 0, premiumUntil: 0, commands: 0, totalSpent: 0, lastCommands: [] };
  const cost = fixedCost !== null && fixedCost !== undefined && Number.isFinite(Number(fixedCost)) ? Math.round(clamp(Number(fixedCost), 0.05, 10) * 100) / 100 : complexityScore(commandText, u.lastCommands || []);
  const capacity = clamp(Number(u.maxBatteryCapacity || 100), 100, 10000);
  const actualCost = Math.round(Math.min(clamp(Number(u.energy ?? 100), 0, capacity), cost) * 100) / 100;
  u.energy = Math.round(clamp(Number(u.energy ?? 100) - actualCost, 0, capacity) * 100) / 100;
  u.commands = Number(u.commands || 0) + 1; u.totalSpent = Math.round((Number(u.totalSpent || 0) + actualCost) * 100) / 100;
  u.lastCommands = [...(u.lastCommands || []).slice(-4), String(commandText || '').slice(0, 120)];
  all[key] = u;
  const keys = Object.keys(all); if (keys.length > MAX_USERS) for (const old of keys.slice(0, keys.length - MAX_USERS)) delete all[old];
  await atomicJson(ENERGY_FILE, all);
  const premium = Number(u.premiumUntil || 0) > Date.now();
  return { energy: u.energy, cost: actualCost, estimatedCost: cost, premium, commands: u.commands, totalSpent: u.totalSpent, limit: clamp(Number(u.limit ?? 20), 0, 100) };
}
async function chargeEnergyUnlocked(userId, now = Date.now(), fast = false) {
  // Legacy API now starts a timed charge; fast mode is intentionally not instant.
  if (fast) return { ok: false, reason: 'fast-charging-disabled', energy: (await getEnergy(userId)).energy };
  return startCharging(userId, now);
}
async function grantPremiumUnlocked(userId, days = 30, now = Date.now()) {
  const d = clamp(Math.floor(Number(days) || 0), 1, 30), all = await readJson(ENERGY_FILE, {}), key = normUser(userId), u = all[key] || { energy: 100, lastChargeAt: 0, commands: 0, totalSpent: 0, lastCommands: [] };
  u.premiumUntil = Math.min(now + 30 * DAY, Math.max(now, Number(u.premiumUntil || 0)) + d * DAY); all[key] = u; await atomicJson(ENERGY_FILE, all); return u.premiumUntil;
}
export async function consumeLimit(userId, amount = 1, now = Date.now()) {
  return withMutationLock(async () => {
    const all = await readJson(ENERGY_FILE, {}), key = normUser(userId);
    const u = all[key] || { energy: 100, limit: 20, limitResetAt: now + DAY, lastChargeAt: 0, premiumUntil: 0, commands: 0, totalSpent: 0, lastCommands: [] };
    if (Number(u.limitResetAt || 0) <= now) { u.limit = 20; u.limitResetAt = now + DAY; }
    const cost = clamp(Math.ceil(Number(amount) || 1), 1, 10);
    if (Number(u.limit ?? 20) < cost) return { ok: false, reason: 'limit', limit: Number(u.limit ?? 20), cost };
    u.limit = Number(u.limit ?? 20) - cost; all[key] = u; await atomicJson(ENERGY_FILE, all);
    return { ok: true, limit: u.limit, cost, resetAt: u.limitResetAt };
  });
}
export async function hasPremium(userId, now = Date.now()) { const e = await getEnergy(userId); return e.premiumUntil > now; }
export async function getRuntimeSwitches() { const now=Date.now(); if(switchCache && now-switchCacheAt<2000)return {...switchCache}; switchCache={antiSpam:true,globalCooldown:true,...(await readJson(SETTINGS_FILE,{}))};switchCacheAt=now;return {...switchCache}; }
async function setRuntimeSwitchUnlocked(name, enabled) { const current = await getRuntimeSwitches(); if (!['antiSpam','globalCooldown'].includes(name)) throw new Error('Unknown runtime switch'); current[name] = Boolean(enabled); await atomicJson(SETTINGS_FILE, current); switchCache={...current};switchCacheAt=Date.now();return current; }
export async function getPaymentConfig() { return readJson(PAYMENT_FILE, { bank: [], ewallet: [], qrisPath: '', basePrice: 1000, dailyRate: 1.01, priceEpoch: Date.now() }); }
export async function getPremiumPrice(now = Date.now()) { const c = await getPaymentConfig(); const base = clamp(Number(c.basePrice ?? c.pricePerDay ?? 1000), 1, 100000000); const rate = clamp(Number(c.dailyRate ?? 1.01), 0.8, 1.2); const days = Math.max(0, Math.min(3650, Math.floor((now - Number(c.priceEpoch || now)) / DAY))); return clamp(Math.round(base * Math.pow(rate, days)), 1, 100000000000); }
async function setPaymentConfigUnlocked(patch) { const current = await getPaymentConfig(); const next = { ...current, ...patch }; await atomicJson(PAYMENT_FILE, next); return next; }
async function recordHitUnlocked(userId, command) { const all = await readJson(HITS_FILE, { total: 0, commands: {}, users: {} }), u = normUser(userId), c = String(command || 'unknown').toLowerCase().slice(0, 64); all.total++; all.commands[c] = Number(all.commands[c] || 0) + 1; if (!all.users[u]) all.users[u] = { total: 0, commands: {} }; all.users[u].total++; all.users[u].commands[c] = Number(all.users[u].commands[c] || 0) + 1; await atomicJson(HITS_FILE, all); return all; }
export async function getHits() { return readJson(HITS_FILE, { total: 0, commands: {}, users: {} }); }
export async function getEnergyRuntimeInfo() { const m = process.memoryUsage(); return { rssMB: Math.round(m.rss / 1048576), heapUsedMB: Math.round(m.heapUsed / 1048576), platform: `${os.platform()} ${os.arch()}`, node: process.versions.node, worker: 'inline-bounded-O(n)', pendingWrites: pendingWriteCount }; }
export function energyFooter(receipt) { return receipt ? `\n\n-${receipt.cost.toFixed(2).replace('.', ',')}% baterai digunakan. 🔋 ${receipt.energy.toFixed(2).replace('.', ',')}% tersisa.` : ''; }

// Serialize read-modify-write transactions in-process so concurrent messages cannot overwrite one another.
export const consumeEnergy = (...args) => withMutationLock(() => consumeEnergyUnlocked(...args));
export const chargeEnergy = (...args) => startCharging(...args);
export const grantPremium = (...args) => withMutationLock(() => grantPremiumUnlocked(...args));
export const setRuntimeSwitch = (...args) => withMutationLock(() => setRuntimeSwitchUnlocked(...args));
export const setPaymentConfig = (...args) => withMutationLock(() => setPaymentConfigUnlocked(...args));
export const recordHit = (...args) => withMutationLock(() => recordHitUnlocked(...args));

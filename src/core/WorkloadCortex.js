/** Deterministic workload/energy estimator. No global state and no model call. */
const ZERO_COST = new Set(['menu','help','setmenu','status','statusbaterai','statusenergi','battery','batteryinfo','setenergy','resetenergy','energyset','energyreset','profile','charge','modcoin','ping','owner','energy','cortex','typo','memory','reminder','reminders','reminder-audit','nsfw']);
const NETWORK = /(?:fetch|axios|http|https|download|scrape|weather|translate|anime|manga|news|github|youtube|tiktok|instagram|facebook|spotify|lyrics)/i;
const AI = /(?:^ai$|ask|chatbot|imagine|generate|summarize|review|debate|tutor)/i;
const HEAVY = /(?:canvas|render|video|batch|playlist|transcode|rpg-sync|raidboss|worldmap)/i;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export function estimateWorkload({ command = '', args = [], plugin = {}, runtime = {} } = {}) {
  const name = String(command).toLowerCase();
  if (ZERO_COST.has(name) || plugin.energyMode === 'free' || plugin.energyCost === 0) return { mode: 'exempt', cost: 0, reason: 'control-or-recovery-command', network: false, ai: false, heavy: false };
  const input = [name, ...(Array.isArray(args) ? args : [String(args)])].join(' ').slice(0, 1200);
  const network = plugin.workload === 'network' || NETWORK.test(name) || /https?:\/\//i.test(input);
  const ai = plugin.workload === 'ai' || AI.test(name);
  const heavy = plugin.workload === 'heavy' || HEAVY.test(name);
  if (plugin.energyMode === 'static' && Number.isFinite(Number(plugin.energyCost))) {
    return { mode: 'static', cost: clamp(Number(plugin.energyCost), 0, 10), reason: 'declared-static-cost', network, ai, heavy };
  }
  const chars = [...input].length;
  const base = 0.15 + Math.min(chars, 1200) * 0.0015;
  const cost = clamp(base + (network ? 1.1 : 0) + (ai ? 2.2 : 0) + (heavy ? 2.8 : 0) + Math.max(0, Number(runtime.queueDepth || 0)) * 0.08 + Math.max(0, Number(runtime.heapPressure || 0)) * 0.02, 0.15, 9.5);
  return { mode: 'dynamic', cost: Math.round(cost * 100) / 100, reason: 'bounded-workload-estimate', network, ai, heavy };
}
export function applyEnergySaver(cost, { enabled = false, energy = 100, threshold = 20 } = {}) {
  const unlocked = Number(energy) < threshold;
  if (!enabled || !unlocked || cost <= 0) return { cost: Math.round(cost * 100) / 100, unlocked, saverApplied: false, cooldownMultiplier: 1 };
  return { cost: Math.round(Math.max(0.05, cost * 0.55) * 100) / 100, unlocked, saverApplied: true, cooldownMultiplier: 2.5 };
}
export function getWorkloadShard({ cpuPercent = 0, heapUsedMB = 0, heapTotalMB = 1, queueDepth = 0 } = {}) {
  const heapPercent = heapTotalMB > 0 ? heapUsedMB / heapTotalMB * 100 : 0;
  const score = Math.max(cpuPercent, heapPercent, queueDepth * 5);
  return { score: Math.round(score * 10) / 10, heapPercent: Math.round(heapPercent * 10) / 10, state: score >= 90 ? 'CRITICAL' : score >= 75 ? 'HIGH' : score >= 50 ? 'ELEVATED' : 'NORMAL' };
}
export { ZERO_COST };

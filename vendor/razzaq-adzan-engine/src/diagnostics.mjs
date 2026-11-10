import { ValidationError } from './errors.mjs';
const KEYS = ['fajr','dhuhr','asr','maghrib','isha'];
export function validateSchedule(schedule) {
  if (!schedule?.times || !Array.isArray(schedule.prayerOrder)) throw new ValidationError('Invalid schedule shape.');
  const issues = [];
  for (const key of KEYS) if (!Number.isFinite(schedule.times[key]?.minutes)) issues.push({ code: 'MISSING_EVENT', event: key });
  for (let i=1;i<KEYS.length;i++) { const a=schedule.times[KEYS[i-1]]?.minutes,b=schedule.times[KEYS[i]]?.minutes; if (Number.isFinite(a)&&Number.isFinite(b)&&b<=a) issues.push({code:'NON_CHRONOLOGICAL',from:KEYS[i-1],to:KEYS[i]}); }
  return Object.freeze({ valid: issues.length===0, issues, checkedAt: new Date().toISOString() });
}
export function compareSchedules(calculated, reference, { toleranceMinutes = 3 } = {}) {
  if (!Number.isFinite(toleranceMinutes) || toleranceMinutes < 0) throw new ValidationError('toleranceMinutes must be non-negative.');
  const differences = Object.fromEntries(KEYS.map(k => [k, Number.isFinite(calculated?.times?.[k]?.minutes) && Number.isFinite(reference?.times?.[k]?.minutes) ? Number((calculated.times[k].minutes-reference.times[k].minutes).toFixed(2)) : null]));
  return Object.freeze({ date: calculated?.date ?? null, toleranceMinutes, differences, withinTolerance: Object.values(differences).every(v=>v!==null&&Math.abs(v)<=toleranceMinutes), note:'Comparison only; reference provenance and method must be independently verified.' });
}

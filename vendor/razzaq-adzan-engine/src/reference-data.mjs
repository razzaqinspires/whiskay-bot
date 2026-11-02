import { ValidationError } from './errors.mjs';
const PRAYERS=['fajr','dhuhr','asr','maghrib','isha'];
// Adapter contract: callers supply data from a licensed/official provider; no endpoint is assumed.
export function normalizeReferenceSchedule(input, { source, retrievedAt = new Date().toISOString(), license = 'unspecified' } = {}) {
  if (!source || typeof source !== 'string') throw new ValidationError('A named reference source is required.');
  if (!input || typeof input !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? '')) throw new ValidationError('Reference data must include date YYYY-MM-DD.');
  const times={};
  for(const key of PRAYERS){ const value=input.times?.[key]; if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new ValidationError(`Reference time ${key} must use HH:mm.`); const [h,m]=value.split(':').map(Number); times[key]={time:value,minutes:h*60+m}; }
  return Object.freeze({date:input.date,times:Object.freeze(times),provenance:Object.freeze({source,retrievedAt,license,verified:false,verificationRequired:true})});
}

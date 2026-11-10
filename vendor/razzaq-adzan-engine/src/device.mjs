import { ValidationError } from './errors.mjs';
export function createDeviceSchedulePayload(schedule, { deviceId, firmwareChannel='stable' } = {}) {
  if (!deviceId || typeof deviceId!=='string') throw new ValidationError('deviceId is required.');
  if (!schedule?.times || !schedule?.date) throw new ValidationError('A calculated schedule is required.');
  const prayerTimes=Object.fromEntries(['fajr','dhuhr','asr','maghrib','isha'].map(k=>{const t=schedule.times[k]?.time;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(t??''))throw new ValidationError(`Invalid ${k} time.`);return[k,t];}));
  return Object.freeze({schema:'razzaq-adzan-device/v1',deviceId,firmwareChannel,date:schedule.date,timeZone:schedule.timeZone,prayerTimes,generatedAt:new Date().toISOString(),source:{algorithm:schedule.metadata?.algorithm??'unknown',officialValidation:false},offlineReady:true});
}

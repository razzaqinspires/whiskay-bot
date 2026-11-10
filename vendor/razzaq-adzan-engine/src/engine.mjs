import { calculatePrayerTimes } from './prayer-times.mjs';
import { addCalendarDays, parseDateInput, dateKey, zonedTimeToEpoch, getLocalMinutes } from './timezone.mjs';
import { METHODS } from './methods.mjs';
import { ValidationError } from './errors.mjs';
import { getQiblaDirection } from './qibla.mjs';

const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function createAdzanEngine(defaults = {}) {
  if (!defaults.location) throw new ValidationError('createAdzanEngine requires defaults.location.');
  const config = deepFreeze(structuredClone({ timeZone: 'Asia/Jakarta', method: METHODS.INDONESIA_KEMENAG_REFERENCE, ...defaults }));

  function getSchedule(options = {}) {
    return calculatePrayerTimes({ ...config, ...options });
  }

  function getNextPrayer({ now = new Date(), ...options } = {}) {
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new ValidationError('now must be a valid Date.');
    const effective = { ...config, ...options };
    const localToday = parseDateInput(now, effective.timeZone);

    for (let dayOffset = 0; dayOffset <= 2; dayOffset += 1) {
      const day = addCalendarDays(localToday, dayOffset);
      const schedule = getSchedule({ ...options, date: dateKey(day) });
      for (const prayer of PRAYERS) {
        const event = schedule.times[prayer];
        const targetEpoch = zonedTimeToEpoch(day, event.minutes, effective.timeZone);
        if (targetEpoch > now.getTime()) {
          return {
            prayer,
            date: schedule.date,
            time: event.time,
            at: new Date(targetEpoch).toISOString(),
            inSeconds: Math.ceil((targetEpoch - now.getTime()) / 1000),
            schedule
          };
        }
      }
    }
    throw new ValidationError('Unable to determine the next prayer within the next 48 hours.');
  }

  function getCurrentPrayer({ now = new Date(), ...options } = {}) {
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new ValidationError('now must be a valid Date.');
    const effective = { ...config, ...options };
    const today = parseDateInput(now, effective.timeZone);
    const todaySchedule = getSchedule({ ...options, date: dateKey(today) });
    const localMinutes = getLocalMinutes(now, effective.timeZone);

    for (const prayer of [...PRAYERS].reverse()) {
      if (todaySchedule.times[prayer].minutes <= localMinutes) {
        return { prayer, date: todaySchedule.date, time: todaySchedule.times[prayer].time, schedule: todaySchedule };
      }
    }
    const yesterday = addCalendarDays(today, -1);
    const previousSchedule = getSchedule({ ...options, date: dateKey(yesterday) });
    return {
      prayer: 'isha',
      date: previousSchedule.date,
      time: previousSchedule.times.isha.time,
      schedule: previousSchedule
    };
  }

  function getRange({ startDate, days = 7, ...options } = {}) {
    if (!Number.isInteger(days) || days < 1 || days > 366) {
      throw new ValidationError('days must be an integer between 1 and 366.');
    }
    const start = parseDateInput(startDate, config.timeZone);
    return Array.from({ length: days }, (_, index) => {
      const day = addCalendarDays(start, index);
      return getSchedule({ ...options, date: dateKey(day) });
    });
  }

  function getQibla() { return getQiblaDirection(config.location); }

  return Object.freeze({ getSchedule, getNextPrayer, getCurrentPrayer, getRange, getQibla, config });
}

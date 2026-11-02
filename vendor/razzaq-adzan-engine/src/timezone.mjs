import { ValidationError } from './errors.mjs';

const formatterCache = new Map();

function getFormatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    try {
      formatterCache.set(timeZone, new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23'
      }));
    } catch (cause) {
      throw new ValidationError(`Invalid or unsupported IANA time zone: ${timeZone}`, { cause });
    }
  }
  return formatterCache.get(timeZone);
}

export function getZonedParts(date, timeZone) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new ValidationError('date must be a valid Date.');
  const parts = Object.fromEntries(getFormatter(timeZone).formatToParts(date).map(({ type, value }) => [type, value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second)
  };
}

export function getUtcOffsetMinutes(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  const representedAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((representedAsUtc - date.getTime()) / 60_000);
}

export function parseDateInput(date, timeZone = 'Asia/Jakarta') {
  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) throw new ValidationError('date must be valid.');
    return getZonedParts(date, timeZone);
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ValidationError("date must be a Date or a YYYY-MM-DD string.");
  }
  const [year, month, day] = date.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) {
    throw new ValidationError(`Invalid calendar date: ${date}`);
  }
  return { year, month, day };
}

export function addCalendarDays(dateParts, amount) {
  const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day + amount));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function dateKey({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function minutesToTime(minutes) {
  if (!Number.isFinite(minutes)) return null;
  const rounded = Math.round(minutes);
  const normalized = ((rounded % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function getLocalMinutes(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  return p.hour * 60 + p.minute + p.second / 60;
}

/** Convert a wall-clock time in an IANA zone to an epoch timestamp. */
export function zonedTimeToEpoch(dateParts, minutes, timeZone) {
  const total = Math.round(minutes);
  const dayShift = Math.floor(total / 1440);
  const minuteOfDay = ((total % 1440) + 1440) % 1440;
  const targetDate = addCalendarDays(dateParts, dayShift);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const desiredUtcShape = Date.UTC(targetDate.year, targetDate.month - 1, targetDate.day, hour, minute);
  let guess = desiredUtcShape;

  // Two correction passes handle ordinary zones and daylight-saving transitions.
  for (let i = 0; i < 3; i += 1) {
    const offset = getUtcOffsetMinutes(new Date(guess), timeZone);
    const next = desiredUtcShape - offset * 60_000;
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

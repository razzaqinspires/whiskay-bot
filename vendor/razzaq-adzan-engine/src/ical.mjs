import { ValidationError } from './errors.mjs';
import { addCalendarDays, parseDateInput, zonedTimeToEpoch } from './timezone.mjs';

const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const LABELS = { fajr: 'Subuh', dhuhr: 'Zuhur', asr: 'Asar', maghrib: 'Maghrib', isha: 'Isya' };
const pad = (n) => String(n).padStart(2, '0');
const utcStamp = (date) => `${date.getUTCFullYear()}${pad(date.getUTCMonth()+1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
const escapeText = (value) => String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const foldLine = (line) => {
  const chunks = [];
  let current = '';
  for (const char of line) {
    if (Buffer.byteLength(current + char, 'utf8') > 73) { chunks.push(current); current = ` ${char}`; }
    else current += char;
  }
  chunks.push(current);
  return chunks.join('\r\n');
};

/** Export the five daily prayer events as a standards-based iCalendar document. */
export function exportPrayerScheduleIcs(schedule, { calendarName = 'Razzaq Prayer Times', durationMinutes = 5 } = {}) {
  if (!schedule || !schedule.date || !schedule.timeZone || !schedule.times) throw new ValidationError('A complete prayer schedule is required.');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 180) throw new ValidationError('durationMinutes must be an integer between 1 and 180.');
  const dateParts = parseDateInput(schedule.date, schedule.timeZone);
  const now = utcStamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Razzaq Ventures//Adzan Engine 1.1//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(calendarName)}`
  ];
  for (const prayer of PRAYERS) {
    const event = schedule.times[prayer];
    if (!event || !Number.isFinite(event.minutes)) throw new ValidationError(`Schedule is missing valid ${prayer} event.`);
    const startMs = zonedTimeToEpoch(dateParts, event.minutes, schedule.timeZone);
    const endMs = startMs + durationMinutes * 60_000;
    const uid = `${schedule.date}-${prayer}@razzaqventures.local`;
    lines.push(
      'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${now}`,
      `DTSTART:${utcStamp(new Date(startMs))}`, `DTEND:${utcStamp(new Date(endMs))}`,
      `SUMMARY:${escapeText(`Waktu ${LABELS[prayer]}`)}`,
      `DESCRIPTION:${escapeText(`${LABELS[prayer]} prayer time. Local time: ${event.time} (${schedule.timeZone}).`)}`,
      'STATUS:CONFIRMED', 'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

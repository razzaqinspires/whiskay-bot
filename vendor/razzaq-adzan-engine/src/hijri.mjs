import { ValidationError } from './errors.mjs';

// Arithmetic/tabular Islamic calendar (civil algorithm). It is NOT a rukyat authority.
export function gregorianToHijri(date) {
  const d = date instanceof Date ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())) : new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new ValidationError('date must be a valid Date or YYYY-MM-DD string.');
  const jd = Math.floor((d.getTime() / 86400000) + 2440588);
  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l2 = l - 10631 * n + 354;
  const j = Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) + Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
  const l3 = l2 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const month = Math.floor((24 * l3) / 709);
  const day = l3 - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return Object.freeze({ year, month, day, monthName: HIJRI_MONTHS[month - 1], calendar: 'tabular-civil', authority: 'calculated-not-rukyat' });
}
export const HIJRI_MONTHS = Object.freeze(['Muharram','Safar','Rabiulawal','Rabiulakhir','Jumadilawal','Jumadilakhir','Rajab','Syakban','Ramadan','Syawal','Zulkaidah','Zulhijah']);

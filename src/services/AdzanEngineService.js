import { createAdzanEngine, METHODS, resolveMethod, gregorianToHijri, exportPrayerScheduleIcs } from '../../vendor/razzaq-adzan-engine/src/index.mjs';
import {
  getEffectiveAdzanProfile,
  listPersonalAdzanSubscribers,
  enqueuePersonalAdzanDelivery, listDuePersonalAdzanDeliveries, claimPersonalAdzanDelivery, finishPersonalAdzanDelivery, getPersonalAdzanDeliveryStats
} from './AdzanProfileStore.js';
import { loadAdzanAudio } from './AdzanAudioService.js';

const PRAYERS = Object.freeze([
  ['fajr', 'Subuh'], ['dhuhr', 'Zuhur'], ['asr', 'Asar'],
  ['maghrib', 'Magrib'], ['isha', 'Isya']
]);
const DEFAULT_METHOD = METHODS.INDONESIA_KEMENAG_REFERENCE;
const PRAYER_LABELS = { fajr: 'Subuh', dhuhr: 'Zuhur', asr: 'Asar', maghrib: 'Magrib', isha: 'Isya' };
function applyCorrections(schedule, profile) {
  const corrections = profile.corrections || {};
  for (const [key, minutes] of Object.entries(corrections)) {
    const event = schedule.times[key];
    if (!event || !Number.isInteger(minutes) || !minutes) continue;
    const adjusted = new Date(Date.parse(event.at) + minutes * 60_000);
    event.at = adjusted.toISOString();
    event.time = new Intl.DateTimeFormat('en-GB', { timeZone: profile.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(adjusted);
    event.minutes += minutes;
  }
  return schedule;
}

function localDate(now, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

/** Convert an IANA-zone wall-clock date/time to UTC without relying on host timezone. */
export function localTimeToUtc(date, time, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(time))) {
    throw new TypeError('Tanggal harus YYYY-MM-DD dan waktu harus HH:mm.');
  }
  // Validate the IANA timezone before conversion.
  new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = target;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  for (let index = 0; index < 5; index++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(part => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const correction = target - represented;
    guess += correction;
    if (correction === 0) break;
  }
  // Some wall-clock times do not exist during a DST jump. Reject rather than silently drift.
  const resultParts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(part => [part.type, part.value]));
  if (Number(resultParts.year) !== year || Number(resultParts.month) !== month || Number(resultParts.day) !== day || Number(resultParts.hour) !== hour || Number(resultParts.minute) !== minute) {
    throw new RangeError(`Waktu lokal ${date} ${time} tidak valid untuk zona ${timeZone} (perubahan DST).`);
  }
  return new Date(guess);
}

function isWithinGrace(at, now, graceMs) {
  const age = Number(now) - Number(at);
  return Number.isFinite(age) && age >= 0 && age <= graceMs;
}

async function queueTextAutomation({ user, prayer, date, at, text, now, result }) {
  if (!isWithinGrace(at, now, result.graceMs)) return;
  const queued = await enqueuePersonalAdzanDelivery({
    user, prayer, date, scheduledAt: new Date(at).toISOString(), text,
    audioEnabled: false, audioPack: 'default', textOnly: true, now
  });
  if (queued.created) result.queued++;
}

export function createPersonalAdzanEngine(profile) {
  if (!profile?.location) throw new Error('Lokasi belum diatur. Jalankan .adzan lokasi terlebih dahulu.');
  if (!profile?.timezone) throw new Error('Zona waktu belum diatur. Jalankan .adzan timezone Asia/Jakarta.');
  return createAdzanEngine({
    location: {
      name: profile.location.name || 'Lokasi pengguna',
      latitude: profile.location.latitude,
      longitude: profile.location.longitude,
      elevationMeters: Number(profile.location.elevationMeters || 0)
    },
    timeZone: profile.timezone,
    method: resolveMethod(profile.methodId || DEFAULT_METHOD)
  });
}

export async function getPersonalAdzanSchedule(user, date = new Date()) {
  const profile = await getEffectiveAdzanProfile(user);
  const engine = createPersonalAdzanEngine(profile);
  const day = typeof date === 'string' ? date : localDate(date, profile.timezone);
  const schedule = applyCorrections(engine.getSchedule({ date: day }), profile);
  return { profile, schedule, next: engine.getNextPrayer({ now: new Date() }) };
}

export function formatCountdown(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [days ? `${days} hari` : '', hours ? `${hours} jam` : '', minutes ? `${minutes} menit` : '', `${secs} detik`].filter(Boolean).join(' ');
}

export async function getPersonalAdzanIntelligence(user, now = new Date()) {
  const { profile, schedule } = await getPersonalAdzanSchedule(user, now);
  const engine = createPersonalAdzanEngine(profile);
  const range = engine.getRange({ startDate: localDate(now, profile.timezone), days: 2 }).map(item => applyCorrections(item, profile));
  const candidates = range.flatMap(day => Object.entries(day.times).map(([prayer, event]) => ({ prayer, ...event })))
    .filter(event => Date.parse(event.at) > now.getTime())
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const next = candidates[0];
  if (!next) throw new Error('Waktu salat berikutnya tidak ditemukan dalam 48 jam.');
  const nextAt = Date.parse(next.at);
  return {
    profile,
    schedule,
    hijri: gregorianToHijri(schedule.date),
    qibla: engine.getQibla(),
    next: { prayer: next.prayer, time: next.time, at: next.at, inSeconds: Math.max(0, Math.ceil((nextAt - now.getTime()) / 1000)) }
  };
}

export async function getPersonalAdzanRange(user, days = 7, startDate = new Date()) {
  const profile = await getEffectiveAdzanProfile(user);
  const engine = createPersonalAdzanEngine(profile);
  const start = typeof startDate === 'string' ? startDate : localDate(startDate, profile.timezone);
  return engine.getRange({ startDate: start, days }).map(item => applyCorrections(item, profile));
}

export async function getPersonalAdzanCalendarFile(user, date = new Date()) {
  const { profile, schedule } = await getPersonalAdzanSchedule(user, date);
  return { profile, filename: `jadwal-salat-${schedule.date}.ics`, content: exportPrayerScheduleIcs(schedule, { calendarName: `Jadwal Salat - ${profile.location.name || 'Lokasi pribadi'}` }) };
}

export async function runPersonalAdzanScheduler(sock, now = Date.now(), { graceMs = 10 * 60_000, deliveryLimit = 100 } = {}) {
  const current = new Date(now);
  const subscribers = await listPersonalAdzanSubscribers();
  const result = { scanned: subscribers.length, due: 0, queued: 0, sent: 0, audioSent: 0, textFallback: 0, retried: 0, dead: 0, skipped: 0, failed: 0, automationQueued: 0, graceMs };

  // First persist every prayer event before attempting delivery. This queue survives restarts.
  for (const subscriber of subscribers) {
    const { user, effective } = subscriber;
    try {
      if (!effective.location || !effective.timezone) { result.skipped++; continue; }
      const engine = createPersonalAdzanEngine(effective);
      const schedule = applyCorrections(engine.getSchedule({ date: localDate(current, effective.timezone) }), effective);
      for (const [key, label] of PRAYERS) {
        const event = schedule.times[key];
        const at = Date.parse(event.at);
        const age = current.getTime() - at;
        if (!Number.isFinite(at)) continue;

        const leadMinutes = Number(subscriber.preferences?.preAlertMinutes || 0);
        if (leadMinutes > 0) {
          const preAt = at - leadMinutes * 60_000;
          const preAge = current.getTime() - preAt;
          if (preAge >= 0 && preAge <= graceMs) {
            const preText = `⏳ *PENGINGAT ${label.toUpperCase()}*\n\n` +
              `${label} diperkirakan mulai dalam *${leadMinutes} menit*.\n` +
              `Waktu salat: *${event.time}* (${effective.timezone})\n` +
              `Wilayah: ${effective.location.name || 'Lokasi pribadi'}\n` +
              `_Pengingat awal berdasarkan jadwal astronomis; cocokkan dengan jadwal setempat._`;
            const preQueued = await enqueuePersonalAdzanDelivery({ user, prayer: `pre-${key}`, date: schedule.date, scheduledAt: new Date(preAt).toISOString(), text: preText, audioEnabled: false, audioPack: 'default', textOnly: true, now });
            if (preQueued.created) result.queued++;
          }
        }
        if (age < 0 || age > graceMs) continue;
        result.due++;
        const caption = `🕌 *WAKTU SALAT ${label.toUpperCase()}*\n\n` +
          `Waktu: *${event.time}* (${effective.timezone})\n` +
          `Tanggal: ${schedule.date}\n` +
          `Wilayah: ${effective.location.name || 'Lokasi pribadi'}\n` +
          `Metode: ${schedule.method.name}\n\n` +
          `_Dihitung dengan Razzaq Adzan Engine. Hasil merupakan perhitungan astronomis perkiraan; cocokkan metode dan koreksi dengan jadwal otoritas/masjid setempat._`;
        const queued = await enqueuePersonalAdzanDelivery({
          user, prayer: key, date: schedule.date, scheduledAt: event.at,
          text: caption, audioEnabled: subscriber.preferences?.audioEnabled !== false, audioPack: subscriber.preferences?.audioPack || 'default', now
        });
        if (queued.created) result.queued++;
        else result.skipped++;
      }

      // Friday/Jumu'ah reminder: wall-clock time is interpreted in each subscriber's IANA timezone.
      const weekday = new Date(`${schedule.date}T00:00:00.000Z`).getUTCDay();
      if (subscriber.preferences?.fridayReminderEnabled && weekday === 5) {
        const fridayAt = localTimeToUtc(schedule.date, subscriber.preferences.fridayReminderTime || '11:00', effective.timezone).getTime();
        const fridayText = `🕌 *PENGINGAT HARI JUMAT*\n\n` +
          `Hari ini Jumat, ${schedule.date}. Persiapkan diri untuk salat Jumat dan berangkat lebih awal.\n` +
          `Pengingat: *${subscriber.preferences.fridayReminderTime || '11:00'}* (${effective.timezone})\n` +
          `Wilayah: ${effective.location.name || 'Lokasi pribadi'}\n\n` +
          `_Waktu pengingat dapat diubah melalui .adzan jumat HH:mm._`;
        const before = result.queued;
        await queueTextAutomation({ user, prayer: 'jummah', date: schedule.date, at: fridayAt, text: fridayText, now, result });
        if (result.queued > before) result.automationQueued++;
      }

      // Ramadan reminders use the engine's tabular-civil Hijri estimate, never a rukyat declaration.
      if (subscriber.preferences?.ramadanReminderEnabled && gregorianToHijri(schedule.date).month === 9) {
        const fajrAt = Date.parse(schedule.times.fajr.at);
        const sahurMinutes = Number(subscriber.preferences?.sahurReminderMinutes ?? 30);
        if (sahurMinutes > 0) {
          const sahurAt = fajrAt - sahurMinutes * 60_000;
          const sahurText = `🌙 *PENGINGAT SAHUR*\n\n` +
            `Waktu Subuh diperkirakan pukul *${schedule.times.fajr.time}* (${effective.timezone}).\n` +
            `Pengingat sahur: *${sahurMinutes} menit sebelum Subuh*.\n` +
            `Wilayah: ${effective.location.name || 'Lokasi pribadi'}\n\n` +
            `_Kalender Ramadan memakai estimasi tabular-civil; ikuti pengumuman resmi dan jadwal imsakiyah setempat._`;
          const before = result.queued;
          await queueTextAutomation({ user, prayer: 'sahur', date: schedule.date, at: sahurAt, text: sahurText, now, result });
          if (result.queued > before) result.automationQueued++;
        }
        if (subscriber.preferences?.iftarReminderEnabled !== false) {
          const maghribAt = Date.parse(schedule.times.maghrib.at);
          const iftarMinutes = Number(subscriber.preferences?.iftarReminderMinutes || 0);
          const iftarAt = maghribAt - iftarMinutes * 60_000;
          const iftarText = `🌅 *PENGINGAT BERBUKA PUASA*\n\n` +
            `Waktu Magrib diperkirakan pukul *${schedule.times.maghrib.time}* (${effective.timezone}).\n` +
            `${iftarMinutes ? `Pengingat dikirim ${iftarMinutes} menit sebelum Magrib.` : 'Pengingat dikirim saat waktu Magrib.'}\n` +
            `Wilayah: ${effective.location.name || 'Lokasi pribadi'}\n\n` +
            `_Periksa jadwal imsakiyah dan waktu Magrib otoritas/masjid setempat._`;
          const before = result.queued;
          await queueTextAutomation({ user, prayer: 'iftar', date: schedule.date, at: iftarAt, text: iftarText, now, result });
          if (result.queued > before) result.automationQueued++;
        }
      }
    } catch (error) {
      result.failed++;
      console.error('[AdzanScheduler] User schedule failed:', user, error?.message || error);
    }
  }

  // Then drain the durable outbox. Failures receive bounded exponential-style retry delays.
  const pending = await listDuePersonalAdzanDeliveries(now, deliveryLimit);
  for (const candidate of pending) {
    const item = await claimPersonalAdzanDelivery(candidate.key, { now });
    if (!item) { result.skipped++; continue; }
    try {
      let deliveredAs = 'text';
      if (item.audioEnabled) {
        let audio = null;
        try { audio = await loadAdzanAudio(item.prayer, { pack: item.audioPack || 'default' }); }
        catch (error) { console.error('[AdzanScheduler] Audio unavailable; using text fallback:', item.key, error?.message || error); }
        if (audio) {
          try {
            await sock.sendMessage(item.user, { ...audio, caption: item.text });
            deliveredAs = 'audio';
          } catch (audioError) {
            console.error('[AdzanScheduler] Audio delivery failed; trying text fallback:', item.user, item.prayer, audioError?.message || audioError);
            await sock.sendMessage(item.user, { text: `${item.text}\n\n_(Audio gagal dikirim; pengingat teks sebagai pengganti.)_` });
          }
        } else {
          await sock.sendMessage(item.user, { text: `${item.text}\n\n_(Audio belum dipasang atau tidak valid; pengingat teks dikirim.)_` });
        }
      } else {
        const footer = item.textOnly ? '_Pengingat otomatis ini dikirim sebagai teks._' : '_Audio dinonaktifkan pada preferensimu._';
        await sock.sendMessage(item.user, { text: `${item.text}\n\n${footer}` });
      }
      await finishPersonalAdzanDelivery(item.key, { success: true, now });
      result.sent++;
      if (deliveredAs === 'audio') result.audioSent++; else result.textFallback++;
    } catch (error) {
      const outcome = await finishPersonalAdzanDelivery(item.key, { success: false, error: error?.message || error, now }).catch(() => ({ status: 'unknown' }));
      result.failed++;
      if (outcome.status === 'queued') result.retried++;
      if (outcome.status === 'dead') result.dead++;
      console.error('[AdzanScheduler] Delivery queued for retry:', item.user, item.prayer, outcome, error?.message || error);
    }
  }
  result.outbox = await getPersonalAdzanDeliveryStats();
  delete result.graceMs;
  return result;
}

export { PRAYERS as PERSONAL_ADZAN_PRAYERS };

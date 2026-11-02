import { EventEmitter } from 'node:events';
import { createAdzanEngine } from './engine.mjs';
import { addCalendarDays, parseDateInput, dateKey, zonedTimeToEpoch } from './timezone.mjs';
import { ValidationError } from './errors.mjs';

const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const MAX_TIMEOUT_MS = 2_147_000_000;

/**
 * Optional Node.js scheduler. It emits an `adhan` event; it does not play audio.
 * Audio, push notifications, and WhatsApp messages belong in platform adapters.
 */
export class AdzanScheduler extends EventEmitter {
  #engine;
  #timer = null;
  #running = false;
  #fired = new Set();
  #clock;

  #missedPolicy; #maxLatenessMs; #unref;

  constructor({ engine, engineOptions, clock = () => new Date(), missedPolicy = 'skip', maxLatenessMs = 600000, unref = false } = {}) {
    super();
    this.#engine = engine ?? createAdzanEngine(engineOptions ?? {});
    if (typeof clock !== 'function') throw new ValidationError('clock must be a function.');
    this.#clock = clock;
    if (!['skip','emit'].includes(missedPolicy)) throw new ValidationError("missedPolicy must be 'skip' or 'emit'.");
    if (!Number.isFinite(maxLatenessMs) || maxLatenessMs < 0) throw new ValidationError('maxLatenessMs must be non-negative.');
    this.#missedPolicy = missedPolicy; this.#maxLatenessMs = maxLatenessMs; this.#unref = Boolean(unref);
  }

  get running() { return this.#running; }

  start() {
    if (this.#running) return this;
    this.#running = true;
    this.#planNext();
    this.emit('started');
    return this;
  }

  stop() {
    this.#running = false;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.emit('stopped');
    return this;
  }

  #findNext(now) {
    const timeZone = this.#engine.config.timeZone;
    const today = parseDateInput(now, timeZone);
    const candidates = [];
    for (let offset = 0; offset <= 2; offset += 1) {
      const day = addCalendarDays(today, offset);
      const schedule = this.#engine.getSchedule({ date: dateKey(day) });
      for (const prayer of PRAYERS) {
        const event = schedule.times[prayer];
        const atMs = zonedTimeToEpoch(day, event.minutes, timeZone);
        const key = `${schedule.date}:${prayer}`;
        if (atMs > now.getTime() && !this.#fired.has(key)) {
          candidates.push({ atMs, key, prayer, schedule, event });
        }
      }
    }
    candidates.sort((a, b) => a.atMs - b.atMs);
    return candidates[0] ?? null;
  }

  #reportError(error) {
    this.emit('schedulerError', error);
    if (this.listenerCount('error') > 0) this.emit('error', error);
  }

  #planNext() {
    if (!this.#running) return;
    const now = this.#clock();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      this.#reportError(new ValidationError('Scheduler clock returned an invalid Date.'));
      this.stop();
      return;
    }
    const next = this.#findNext(now);
    if (!next) {
      this.#reportError(new ValidationError('No upcoming prayer event could be scheduled.'));
      this.stop();
      return;
    }
    const delay = Math.max(0, Math.min(next.atMs - now.getTime(), MAX_TIMEOUT_MS));
    this.#timer = setTimeout(() => {
      this.#timer = null;
      if (!this.#running) return;
      const current = this.#clock();
      if (current.getTime() >= next.atMs && !this.#fired.has(next.key)) {
        this.#fired.add(next.key);
        const latenessMs = current.getTime() - next.atMs;
        if (latenessMs > this.#maxLatenessMs && this.#missedPolicy === 'skip') { this.emit('missed', { prayer: next.prayer, date: next.schedule.date, latenessMs, scheduledAt: new Date(next.atMs).toISOString() }); this.#planNext(); return; }
        this.emit('adhan', {
          prayer: next.prayer,
          date: next.schedule.date,
          time: next.event.time,
          scheduledAt: new Date(next.atMs).toISOString(),
          emittedAt: current.toISOString(),
          latenessMs,
          schedule: next.schedule
        });
      }
      this.#planNext();
    }, delay);
    if (this.#unref) this.#timer.unref?.();
  }
}

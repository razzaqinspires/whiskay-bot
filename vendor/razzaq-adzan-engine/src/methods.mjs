/**
 * Method presets are starting points, not a declaration that all official
 * schedules use identical rounding, elevation, ephemeris, or ihtiyati rules.
 */
export const METHODS = Object.freeze({
  INDONESIA_KEMENAG_REFERENCE: Object.freeze({
    id: 'indonesia-kemenag-reference',
    name: 'Indonesia / Kemenag reference',
    fajrAngle: 20,
    ishaAngle: 18,
    asrShadowFactor: 1,
    sunriseAltitude: -0.833,
    dhuhaAltitude: 4.5,
    imsakMinutesBeforeFajr: 10,
    ihtiyati: Object.freeze({ fajr: 2, dhuhr: 2, asr: 2, maghrib: 2, isha: 2 }),
    sunriseAdjustment: -2,
    dhuhaAdjustment: 2
  }),
  MUSLIM_WORLD_LEAGUE: Object.freeze({
    id: 'mwl',
    name: 'Muslim World League',
    fajrAngle: 18,
    ishaAngle: 17,
    asrShadowFactor: 1,
    sunriseAltitude: -0.833,
    dhuhaAltitude: 4.5,
    imsakMinutesBeforeFajr: 10,
    ihtiyati: Object.freeze({ fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }),
    sunriseAdjustment: 0,
    dhuhaAdjustment: 0
  }),
  EGYPTIAN: Object.freeze({
    id: 'egyptian',
    name: 'Egyptian General Authority',
    fajrAngle: 19.5,
    ishaAngle: 17.5,
    asrShadowFactor: 1,
    sunriseAltitude: -0.833,
    dhuhaAltitude: 4.5,
    imsakMinutesBeforeFajr: 10,
    ihtiyati: Object.freeze({ fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }),
    sunriseAdjustment: 0,
    dhuhaAdjustment: 0
  })
});

export function resolveMethod(method = METHODS.INDONESIA_KEMENAG_REFERENCE) {
  if (typeof method === 'string') {
    const preset = Object.values(METHODS).find((item) => item.id === method);
    if (!preset) throw new TypeError(`Unknown calculation method: ${method}`);
    return structuredClone(preset);
  }
  if (!method || typeof method !== 'object' || Array.isArray(method)) {
    throw new TypeError('method must be a preset id or a configuration object.');
  }
  if (method.ihtiyati !== undefined && (!method.ihtiyati || typeof method.ihtiyati !== 'object' || Array.isArray(method.ihtiyati))) {
    throw new TypeError('method.ihtiyati must be an object keyed by prayer event.');
  }
  const base = structuredClone(METHODS.INDONESIA_KEMENAG_REFERENCE);
  const merged = {
    ...base,
    ...method,
    ihtiyati: { ...base.ihtiyati, ...(method.ihtiyati ?? {}) }
  };
  for (const key of ['fajrAngle', 'ishaAngle', 'asrShadowFactor', 'sunriseAltitude', 'dhuhaAltitude']) {
    if (!Number.isFinite(merged[key])) throw new TypeError(`method.${key} must be a finite number.`);
  }
  if (merged.fajrAngle <= 0 || merged.fajrAngle >= 30) throw new RangeError('method.fajrAngle must be between 0 and 30 degrees.');
  if (merged.ishaAngle <= 0 || merged.ishaAngle >= 30) throw new RangeError('method.ishaAngle must be between 0 and 30 degrees.');
  if (merged.asrShadowFactor <= 0) throw new RangeError('method.asrShadowFactor must be greater than 0.');
  if (!Number.isFinite(merged.imsakMinutesBeforeFajr) || merged.imsakMinutesBeforeFajr < 0 || merged.imsakMinutesBeforeFajr > 120) throw new RangeError('method.imsakMinutesBeforeFajr must be between 0 and 120.');
  for (const [key, value] of Object.entries(merged.ihtiyati ?? {})) {
    if (!Number.isFinite(value) || Math.abs(value) > 30) throw new RangeError(`method.ihtiyati.${key} must be a finite number within +/-30 minutes.`);
  }
  for (const key of ['sunriseAdjustment', 'dhuhaAdjustment']) {
    if (!Number.isFinite(merged[key] ?? 0) || Math.abs(merged[key] ?? 0) > 60) throw new RangeError(`method.${key} must be within +/-60 minutes.`);
  }
  return merged;
}

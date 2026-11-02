import { METHODS, resolveMethod } from './methods.mjs';
import { SolarEventUnavailableError, ValidationError } from './errors.mjs';
import {
  getAsrAltitude,
  getHorizonDipDegrees,
  getSolarCoordinatesForAlgorithm,
  SOLAR_ALGORITHMS,
  getSolarEventMinutes,
  getSolarNoonMinutes,
  validateCoordinates
} from './solar.mjs';
import {
  dateKey,
  minutesToTime,
  parseDateInput,
  getUtcOffsetMinutes,
  zonedTimeToEpoch
} from './timezone.mjs';

const PRAYER_KEYS = Object.freeze(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);

function assertFiniteAdjustmentMap(adjustments = {}) {
  for (const [key, value] of Object.entries(adjustments)) {
    if (!Number.isFinite(value)) throw new ValidationError(`adjustments.${key} must be a finite number.`);
  }
}

function buildEvent(minutes, adjustment = 0) {
  const adjustedMinutes = minutes + adjustment;
  return {
    minutes: adjustedMinutes,
    time: minutesToTime(adjustedMinutes),
    adjustmentMinutes: adjustment
  };
}

/**
 * Calculate prayer times for one local calendar date.
 * Uses a NOAA solar-position approximation; this is not an official SIHAT clone.
 */
export function calculatePrayerTimes({
  date,
  location,
  timeZone = 'Asia/Jakarta',
  method = METHODS.INDONESIA_KEMENAG_REFERENCE,
  adjustments = {},
  algorithm = SOLAR_ALGORITHMS.MEEUS
}) {
  validateCoordinates(location);
  assertFiniteAdjustmentMap(adjustments);
  const localDate = parseDateInput(date, timeZone);
  const resolvedMethod = resolveMethod(method);
  const elevationMeters = location.elevationMeters ?? 0;
  const solar = getSolarCoordinatesForAlgorithm(localDate, algorithm);

  // Noon UTC is used to resolve the zone's offset on the requested local date.
  const offsetProbe = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day, 12));
  const utcOffsetMinutes = getUtcOffsetMinutes(offsetProbe, timeZone);
  const solarNoon = getSolarNoonMinutes(location.longitude, solar.equationOfTimeMinutes, utcOffsetMinutes);
  const horizonDip = getHorizonDipDegrees(elevationMeters);
  const sunriseAltitude = resolvedMethod.sunriseAltitude - horizonDip;

  const raw = {};
  raw.fajr = getSolarEventMinutes({
    latitude: location.latitude,
    declinationRadians: solar.declinationRadians,
    solarNoonMinutes: solarNoon,
    altitudeDegrees: -resolvedMethod.fajrAngle,
    direction: 'morning'
  });
  raw.sunrise = getSolarEventMinutes({
    latitude: location.latitude,
    declinationRadians: solar.declinationRadians,
    solarNoonMinutes: solarNoon,
    altitudeDegrees: sunriseAltitude,
    direction: 'morning'
  });
  raw.dhuhr = solarNoon;
  const asrAltitude = getAsrAltitude(location.latitude, solar.declinationDegrees, resolvedMethod.asrShadowFactor);
  raw.asr = getSolarEventMinutes({
    latitude: location.latitude,
    declinationRadians: solar.declinationRadians,
    solarNoonMinutes: solarNoon,
    altitudeDegrees: asrAltitude,
    direction: 'evening'
  });
  raw.maghrib = getSolarEventMinutes({
    latitude: location.latitude,
    declinationRadians: solar.declinationRadians,
    solarNoonMinutes: solarNoon,
    altitudeDegrees: sunriseAltitude,
    direction: 'evening'
  });
  raw.isha = getSolarEventMinutes({
    latitude: location.latitude,
    declinationRadians: solar.declinationRadians,
    solarNoonMinutes: solarNoon,
    altitudeDegrees: -resolvedMethod.ishaAngle,
    direction: 'evening'
  });
  raw.dhuha = getSolarEventMinutes({
    latitude: location.latitude,
    declinationRadians: solar.declinationRadians,
    solarNoonMinutes: solarNoon,
    altitudeDegrees: resolvedMethod.dhuhaAltitude,
    direction: 'morning'
  });

  const ihtiyati = resolvedMethod.ihtiyati;
  const times = {
    imsak: buildEvent(raw.fajr, (ihtiyati.fajr ?? 0) - (resolvedMethod.imsakMinutesBeforeFajr ?? 10) + (adjustments.fajr ?? 0) + (adjustments.imsak ?? 0)),
    fajr: buildEvent(raw.fajr, (ihtiyati.fajr ?? 0) + (adjustments.fajr ?? 0)),
    sunrise: buildEvent(raw.sunrise, (resolvedMethod.sunriseAdjustment ?? 0) + (adjustments.sunrise ?? 0)),
    dhuha: buildEvent(raw.dhuha, (resolvedMethod.dhuhaAdjustment ?? 0) + (adjustments.dhuha ?? 0)),
    dhuhr: buildEvent(raw.dhuhr, (ihtiyati.dhuhr ?? 0) + (adjustments.dhuhr ?? 0)),
    asr: buildEvent(raw.asr, (ihtiyati.asr ?? 0) + (adjustments.asr ?? 0)),
    maghrib: buildEvent(raw.maghrib, (ihtiyati.maghrib ?? 0) + (adjustments.maghrib ?? 0)),
    isha: buildEvent(raw.isha, (ihtiyati.isha ?? 0) + (adjustments.isha ?? 0))
  };

  for (const key of PRAYER_KEYS) {
    if (!Number.isFinite(times[key].minutes)) throw new SolarEventUnavailableError(key);
  }
  for (let index = 1; index < PRAYER_KEYS.length; index += 1) {
    const previous = PRAYER_KEYS[index - 1];
    const current = PRAYER_KEYS[index];
    if (times[current].minutes <= times[previous].minutes) {
      throw new ValidationError(`Prayer event order is invalid: ${current} must occur after ${previous}.`);
    }
  }
  for (const event of Object.values(times)) {
    event.at = new Date(zonedTimeToEpoch(localDate, event.minutes, timeZone)).toISOString();
  }

  return {
    date: dateKey(localDate),
    timeZone,
    utcOffsetMinutes,
    location: {
      name: location.name ?? null,
      latitude: location.latitude,
      longitude: location.longitude,
      elevationMeters
    },
    method: {
      id: resolvedMethod.id ?? 'custom',
      name: resolvedMethod.name ?? 'Custom method',
      fajrAngle: resolvedMethod.fajrAngle,
      ishaAngle: resolvedMethod.ishaAngle,
      asrShadowFactor: resolvedMethod.asrShadowFactor,
      ihtiyati: { ...ihtiyati }
    },
    solar: {
      dayOfYear: solar.dayOfYear,
      declinationDegrees: Number(solar.declinationDegrees.toFixed(5)),
      equationOfTimeMinutes: Number(solar.equationOfTimeMinutes.toFixed(3)),
      solarNoon: minutesToTime(solarNoon),
      horizonDipDegrees: Number(horizonDip.toFixed(4))
    },
    times,
    prayerOrder: [...PRAYER_KEYS],
    metadata: {
      algorithm: algorithm === SOLAR_ALGORITHMS.MEEUS ? 'Meeus low-order apparent solar coordinates' : 'NOAA fractional-year solar approximation',
      algorithmId: algorithm,
      calculationVersion: '1.3.0',
      calculationVersion: '1.3.0',
      generatedAt: new Date().toISOString(),
      officialValidation: false,
      precisionClass: algorithm === SOLAR_ALGORITHMS.MEEUS ? 'meeus-low-order' : 'noaa-approximation',
      notes: [
        'Approximate offline calculation; not an official SIHAT/Kemenag output.',
        'Local mosque schedules may apply additional location-specific corrections.',
        'Verify the configured method and adjustments with a trusted local authority.'
      ]
    }
  };
}

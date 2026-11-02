import { SolarEventUnavailableError, ValidationError } from './errors.mjs';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export const toRadians = (degrees) => degrees * DEG;
export const toDegrees = (radians) => radians * RAD;

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function getDayOfYear(year, month, day) {
  const start = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  return Math.floor((current - start) / 86_400_000) + 1;
}

/** NOAA fractional-year approximation, evaluated around local solar noon. */
export function getSolarCoordinates(dateParts) {
  const { year, month, day } = dateParts;
  const dayOfYear = getDayOfYear(year, month, day);
  const yearLength = isLeapYear(year) ? 366 : 365;
  const gamma = (2 * Math.PI / yearLength) * (dayOfYear - 1);

  const equationOfTime = 229.18 * (
    0.000075
    + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma)
  );

  const declination =
    0.006918
    - 0.399912 * Math.cos(gamma)
    + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma)
    + 0.00148 * Math.sin(3 * gamma);

  return {
    dayOfYear,
    equationOfTimeMinutes: equationOfTime,
    declinationRadians: declination,
    declinationDegrees: toDegrees(declination)
  };
}

/** Return the hour angle in degrees for a target solar altitude. */
export function getHourAngleDegrees(latitude, declinationRadians, altitudeDegrees) {
  const latitudeRadians = toRadians(latitude);
  const altitudeRadians = toRadians(altitudeDegrees);
  const numerator = Math.sin(altitudeRadians)
    - Math.sin(latitudeRadians) * Math.sin(declinationRadians);
  const denominator = Math.cos(latitudeRadians) * Math.cos(declinationRadians);

  if (Math.abs(denominator) < 1e-12) {
    throw new SolarEventUnavailableError('hour-angle', 'Solar hour angle is undefined at this location.');
  }
  const cosine = numerator / denominator;
  if (cosine < -1 || cosine > 1) {
    throw new SolarEventUnavailableError('hour-angle', 'The requested solar altitude does not occur on this date at this location.');
  }
  return toDegrees(Math.acos(Math.min(1, Math.max(-1, cosine))));
}

/** Altitude at which the Asr shadow ratio is reached. */
export function getAsrAltitude(latitude, declinationDegrees, shadowFactor = 1) {
  if (!Number.isFinite(shadowFactor) || shadowFactor <= 0) {
    throw new ValidationError('Asr shadowFactor must be greater than zero.');
  }
  const latitudeDifference = Math.abs(latitude - declinationDegrees);
  const cotangent = shadowFactor + Math.tan(toRadians(latitudeDifference));
  return toDegrees(Math.atan(1 / cotangent));
}

/** Small-angle horizon dip correction for positive observer elevation. */
export function getHorizonDipDegrees(elevationMeters = 0) {
  if (!Number.isFinite(elevationMeters) || elevationMeters < 0) {
    throw new ValidationError('elevationMeters must be a non-negative finite number.');
  }
  return 0.0347 * Math.sqrt(elevationMeters);
}

export function getSolarNoonMinutes(longitude, equationOfTimeMinutes, utcOffsetMinutes) {
  return 720 - (4 * longitude) - equationOfTimeMinutes + utcOffsetMinutes;
}

export function getSolarEventMinutes({
  latitude,
  declinationRadians,
  solarNoonMinutes,
  altitudeDegrees,
  direction
}) {
  const hourAngle = getHourAngleDegrees(latitude, declinationRadians, altitudeDegrees);
  const deltaMinutes = hourAngle * 4;
  if (direction === 'morning') return solarNoonMinutes - deltaMinutes;
  if (direction === 'evening') return solarNoonMinutes + deltaMinutes;
  throw new ValidationError("direction must be either 'morning' or 'evening'.");
}

export function validateCoordinates(location) {
  if (!location || typeof location !== 'object') throw new ValidationError('location is required.');
  const { latitude, longitude } = location;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new ValidationError('location.latitude must be between -90 and 90.');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new ValidationError('location.longitude must be between -180 and 180.');
  }
  if (location.elevationMeters !== undefined && (!Number.isFinite(location.elevationMeters) || location.elevationMeters < 0)) {
    throw new ValidationError('location.elevationMeters must be a non-negative finite number.');
  }
  return true;
}

/** Julian day at 12:00 UTC for a Gregorian calendar date. */
export function getJulianDay(dateParts, hourUtc = 12) {
  const { year, month, day } = dateParts;
  if (![year, month, day, hourUtc].every(Number.isFinite)) {
    throw new ValidationError('date parts and hourUtc must be finite numbers.');
  }
  let y = year;
  let m = month;
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716))
    + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5 + hourUtc / 24;
}

/**
 * Meeus low-order apparent solar coordinates (geocentric).
 * Accuracy is suitable for a compact offline prayer-time engine, but this is
 * not NREL SPA and does not model local terrain or a full atmospheric profile.
 */
export function getMeeusSolarCoordinates(dateParts) {
  const jd = getJulianDay(dateParts, 12);
  const t = (jd - 2451545.0) / 36525;
  const l0 = normalizeDegrees(280.46646 + t * (36000.76983 + 0.0003032 * t));
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const mr = toRadians(m);
  const c = Math.sin(mr) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * mr) * (0.019993 - 0.000101 * t)
    + Math.sin(3 * mr) * 0.000289;
  const trueLongitude = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * Math.sin(toRadians(omega));
  const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
  const meanObliquity = 23 + (26 + seconds / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * Math.cos(toRadians(omega));
  const declinationRadians = Math.asin(
    Math.sin(toRadians(obliquity)) * Math.sin(toRadians(apparentLongitude))
  );
  const y = Math.tan(toRadians(obliquity / 2)) ** 2;
  const l0r = toRadians(l0);
  const equationOfTimeRadians = y * Math.sin(2 * l0r)
    - 2 * e * Math.sin(mr)
    + 4 * e * y * Math.sin(mr) * Math.cos(2 * l0r)
    - 0.5 * y * y * Math.sin(4 * l0r)
    - 1.25 * e * e * Math.sin(2 * mr);
  const equationOfTimeMinutes = 4 * toDegrees(equationOfTimeRadians);
  return {
    julianDay: jd,
    julianCenturies: t,
    dayOfYear: getDayOfYear(dateParts.year, dateParts.month, dateParts.day),
    declinationRadians,
    declinationDegrees: toDegrees(declinationRadians),
    equationOfTimeMinutes,
    apparentSolarLongitudeDegrees: normalizeDegrees(apparentLongitude),
    meanObliquityDegrees: meanObliquity
  };
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

export const SOLAR_ALGORITHMS = Object.freeze({
  NOAA: 'noaa',
  MEEUS: 'meeus'
});

export function getSolarCoordinatesForAlgorithm(dateParts, algorithm = SOLAR_ALGORITHMS.MEEUS) {
  if (algorithm === SOLAR_ALGORITHMS.NOAA) return getSolarCoordinates(dateParts);
  if (algorithm === SOLAR_ALGORITHMS.MEEUS) return getMeeusSolarCoordinates(dateParts);
  throw new ValidationError(`Unsupported solar algorithm: ${algorithm}`);
}

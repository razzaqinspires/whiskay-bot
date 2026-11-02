import { ValidationError } from './errors.mjs';
import { validateCoordinates } from './solar.mjs';

// Great-circle initial bearing from the supplied point to the Kaaba.
export const KAABA = Object.freeze({ latitude: 21.422487, longitude: 39.826206 });

export function getQiblaDirection(location) {
  validateCoordinates(location);
  const toRad = (value) => value * Math.PI / 180;
  const toDeg = (value) => value * 180 / Math.PI;
  const lat1 = toRad(location.latitude);
  const lat2 = toRad(KAABA.latitude);
  const deltaLon = toRad(KAABA.longitude - location.longitude);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;
  if (!Number.isFinite(bearing)) throw new ValidationError('Unable to calculate Qibla bearing.');
  return Object.freeze({
    degrees: Number(bearing.toFixed(4)),
    compass: compassPoint(bearing),
    reference: 'true-north',
    kaaba: KAABA
  });
}

function compassPoint(degrees) {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return points[Math.round(degrees / 22.5) % 16];
}

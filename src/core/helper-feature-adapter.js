/** Capability adapters inspired by Experimental-Bell helper patterns; no dynamic eval/import. */
import { EventRegistry } from './event-registry.js';
export const whiskayEvents = new EventRegistry();
export function registerEvent(definition, handler) { return whiskayEvents.register(definition, handler); }
export function emitEvent(command, context, options) { return whiskayEvents.emit(command, context, options); }
export function getEventMenu() { return whiskayEvents.describe(); }
export function normalizeMention(value) { const raw = String(value || '').trim().replace(/^@/, '').replace(/\D/g, ''); return raw ? `${raw}@s.whatsapp.net` : null; }
export function normalizeUrl(value, allowedHosts = []) {
  try { const url = new URL(String(value)); if (!['http:', 'https:'].includes(url.protocol)) return null; if (allowedHosts.length && !allowedHosts.some(host => url.hostname.toLowerCase() === host.toLowerCase() || url.hostname.toLowerCase().endsWith(`.${host.toLowerCase()}`))) return null; return url.toString(); } catch { return null; }
}
export function summarizeMedia(media = {}) { return { type: String(media.mimetype || media.type || 'unknown').split(';')[0].toLowerCase(), seconds: Math.max(0, Number(media.seconds || media.duration || 0)), size: Math.max(0, Number(media.fileLength || media.size || 0)), hasBuffer: Buffer.isBuffer(media.buffer) }; }

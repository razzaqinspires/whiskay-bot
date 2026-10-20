import { randomUUID } from 'node:crypto';
import config from '../config/index.js';

const timeoutMs = Math.max(1000, Number(process.env.WEBSITE_API_TIMEOUT_MS || 8000));

function baseUrl() {
  const raw = String(config.website.baseUrl || '').trim();
  if (!raw) throw new Error('WEBSITE_BASE_URL belum diatur.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('WEBSITE_BASE_URL tidak valid.'); }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('Website API wajib memakai HTTPS kecuali untuk localhost.');
  }
  return url.origin;
}

async function request(path, options = {}) {
  const url = `${baseUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { accept: 'application/json', ...(options.headers || {}) }
    });
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error(`Website mengembalikan respons non-JSON (HTTP ${response.status}).`); }
    if (!response.ok || payload?.ok === false) {
      const message = payload?.error?.message || `Permintaan website gagal (HTTP ${response.status}).`;
      throw new Error(message);
    }
    return { status: response.status, payload };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Koneksi ke website timeout.');
    if (error instanceof TypeError) throw new Error('Website tidak dapat dijangkau. Periksa URL dan koneksi server bot.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkRazzaqWebsite() {
  const { status, payload } = await request('/api/v1/health', { method: 'GET', cache: 'no-store' });
  return { httpStatus: status, ...(payload.data || payload) };
}

/**
 * Sends an integration envelope to the website. The website validates the event and
 * persists accepted records in its configured Supabase store; it does not execute
 * arbitrary remote commands.
 */
export async function sendRazzaqWebsiteEvent({ event, data = {} }) {
  if (!config.website.apiToken) throw new Error('WEBSITE_API_TOKEN belum diatur.');
  const eventName = String(event || '').trim();
  if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(eventName)) {
    throw new Error('Nama event hanya boleh berisi huruf, angka, titik, garis bawah, titik dua, atau tanda hubung (maks. 120 karakter).');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Data event harus berupa objek JSON.');
  }
  const eventId = randomUUID();
  const body = {
    source: 'whatsapp-bot',
    event: eventName,
    eventId,
    occurredAt: new Date().toISOString(),
    data
  };
  const { httpStatus, payload } = await request('/api/v1/integrations', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.website.apiToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body),
    cache: 'no-store'
  });
  return { httpStatus, eventId, result: payload.data || payload };
}


export async function getRazzaqWebsiteAnalytics() {
  if (!config.website.apiToken) throw new Error('WEBSITE_API_TOKEN belum diatur.');
  const { httpStatus, payload } = await request('/api/v1/analytics', {
    method: 'GET',
    headers: { authorization: `Bearer ${config.website.apiToken}` },
    cache: 'no-store'
  });
  return { httpStatus, ...(payload.data || payload) };
}

// Read public website content for the product catalogue. The endpoint must expose
// products with an image URL for image cards; absence of that data is handled by
// the WhatsApp plugin with a readable fallback instead of fabricated products.
export async function getRazzaqWebsiteContent() {
  const { httpStatus, payload } = await request('/api/v1/content', {
    method: 'GET',
    headers: config.website.apiToken ? { authorization: `Bearer ${config.website.apiToken}` } : {},
    cache: 'no-store'
  });
  return { httpStatus, ...(payload.data || payload) };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDir = await mkdtemp(path.join(tmpdir(), 'whiskay-jadibot-test-'));
process.env.JADIBOT_DATA_DIR = tempDir;
process.env.JADIBOT_PORT = String(18000 + Math.floor(Math.random() * 2000));
process.env.JADIBOT_PUBLIC_URL = `http://127.0.0.1:${process.env.JADIBOT_PORT}`;
process.env.JADIBOT_TUNNEL = 'off';
const portal = await import('../src/services/jadibotPortal.js');

test('validates phone numbers in international format', () => {
  assert.equal(portal.isValidPairingPhone('628123456789'), true);
  assert.equal(portal.isValidPairingPhone('+62 812-3456-789'), true);
  assert.equal(portal.isValidPairingPhone('08123456789'), false);
  assert.equal(portal.isValidPairingPhone('abc123'), false);
  assert.equal(portal.isValidPairingPhone('6281234567890123456'), false);
});

test('detects tunnel, hosted URL, and deployment modes', () => {
  assert.equal(portal.detectPortalMode({}), 'trycloudflare');
  assert.equal(portal.detectPortalMode({ JADIBOT_TUNNEL: 'on' }), 'trycloudflare');
  assert.equal(portal.detectPortalMode({ JADIBOT_TUNNEL: 'off' }), 'external-required');
  assert.equal(portal.detectPortalMode({ JADIBOT_PUBLIC_URL: 'https://bot.example.com' }), 'public-url');
  assert.equal(portal.detectPortalMode({ RAILWAY_ENVIRONMENT: 'production' }), 'external-required');
  assert.equal(portal.detectPortalMode({ PORT: '8080' }), 'external-required');
});

test('portal form stores phone once and builds WhatsApp confirmation deep link', async t => {
  portal.setBotNumberProvider(() => '6280000000000');
  const started = await portal.startPairingPortal();
  assert.equal(started.ok, true);
  t.after(async () => { await portal.stopPairingPortal(); await rm(tempDir, { recursive: true, force: true }); });
  const ticket = await portal.createPairingTicket({ userJid: '6281111111111@s.whatsapp.net', userKey: '6281111111111' });
  const page = await fetch(`${started.url}/pair/${ticket.id}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Secure Pairing Portal/i);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  const wrongType = await fetch(`${started.url}/api/pair/${ticket.id}`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '628123456789' });
  assert.equal(wrongType.status, 415, 'reject unsupported content types');
  assert.equal(wrongType.headers.get('x-content-type-options'), 'nosniff');
  const response = await fetch(`${started.url}/api/pair/${ticket.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: '+62 812-3456-789' }) });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.match(data.whatsappUrl, /^https:\/\/wa\.me\/6280000000000\?text=/);
  const consumed = await portal.consumePairingTicket(ticket.id, '6281111111111');
  assert.equal(consumed.ok, true);
  assert.equal(consumed.ticket.phone, '628123456789');
  assert.equal((await portal.consumePairingTicket(ticket.id, '6281111111111')).ok, false, 'ticket must be one-use');
});

test('pairing submit rate limit blocks the ninth attempt in a ten-minute window', () => {
  portal.resetPairingSubmitRateLimitsForTests();
  const key = 'unit-test-rate-limit';
  for (let i = 0; i < 8; i++) assert.equal(portal.checkPairingSubmitRateLimit(key, 1_000 + i).allowed, true);
  const blocked = portal.checkPairingSubmitRateLimit(key, 2_000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
  assert.equal(portal.checkPairingSubmitRateLimit(key, 601_001).allowed, true, 'limit resets after window expires');
  portal.resetPairingSubmitRateLimitsForTests();
});

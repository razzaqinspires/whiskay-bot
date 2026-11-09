import 'dotenv/config';
import Logger from './core/Logger.js';
import { Bot } from './core/Bot.js';
import { CrashGuard } from './core/CrashGuard.js';
import { registry } from './core/registry.js';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { startPairingPortal, stopPairingPortal, setBotNumberProvider } from './services/jadibotPortal.js';
import { startWorldBossTunnel, stopWorldBossTunnel, onWorldBossTunnel } from './services/worldBossTunnel.js';
import { timingSafeEqual } from 'node:crypto';
import { recordWebhookRequest, recordWebhookRejected, recordWebhookAccepted, claimWebhookEvent, completeWebhookEvent, getWebhookRuntimeStats } from './services/webhookRuntime.js';
import { EnvHotReloader } from './core/EnvHotReloader.js';
import { runWithOutboundContext } from './core/OutboundTrafficGuard.js';
import { FixedWindowRateLimiter, createWebhookTempPath, getTrustedClientAddress, parseContentLength, sanitizeDocumentFilename, streamRequestToFile, readRequestBuffer, validateDocumentFile } from './services/WebhookSecurity.js';

const guard = new CrashGuard({
  maxCrashes: 5,
  windowMs: 60_000,
  onFatal: () => Logger.fatal('Terminating due to crash loop — check logs and restart.')
}).install();

const bot = new Bot();
const envHotReloader = new EnvHotReloader().start();
registry.bot = bot;
setBotNumberProvider(() => {
  const jid = registry.sock?.user?.id || bot.sock?.user?.id || '';
  const fromSession = String(jid).split(':')[0].split('@')[0].replace(/\D/g, '');
  return fromSession || process.env.BOT_WHATSAPP_NUMBER || process.env.PAIRING_NUMBER || '';
});

onWorldBossTunnel('connected', state => Logger.info({ url: state.url, endpoint: state.endpoint }, 'World Boss tunnel connected'));
onWorldBossTunnel('error', state => Logger.warn({ error: state.lastError }, 'World Boss tunnel error'));
onWorldBossTunnel('disconnected', state => Logger.warn({ retryCount: state.retryCount }, 'World Boss tunnel disconnected; retry scheduled'));

let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  Logger.info(`Received ${signal}, shutting down...`);
  await envHotReloader.stop().catch(() => {});
  await new Promise(resolve => webhookServer.close(resolve));
  try { await stopPairingPortal(); } catch (e) { Logger.error(`Pairing portal shutdown: ${e.message}`); }
  try { await stopWorldBossTunnel(); } catch (e) { Logger.error(`World Boss tunnel shutdown: ${e.message}`); }
  try { await bot.stop(); } catch (e) { Logger.error(`Shutdown: ${e.message}`); }
  process.exit(0);
};

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('SIGUSR2', async () => {
  Logger.info('SIGUSR2 → triggering plugin reload');
  try { await bot.reloadQueue.push('signal'); } catch {}
});

const webhookSecret = String(process.env.WHISKAY_BOSS_WEBHOOK_SECRET || process.env.DUNGEON_SYNC_TOKEN || '').trim();
const teamdropWebhookSecret = String(process.env.TEAMDROP_WEBHOOK_SECRET || '').trim();
const webhookPort = Number(process.env.WHISKAY_BOT_WEBHOOK_PORT || 8787);
const webhookRate = new FixedWindowRateLimiter({ windowMs: 60_000, maxEntries: 10_000 });
const teamdropRate = new FixedWindowRateLimiter({ windowMs: 60_000, maxEntries: 10_000 });
let teamdropInFlight = 0;
const safeSecretMatch = (supplied, expected) => {
  const a = Buffer.from(String(supplied || ''));
  const b = Buffer.from(String(expected || ''));
  return Boolean(expected) && a.length === b.length && timingSafeEqual(a, b);
};
const decodeHeader = (value, maxLength = 1200) => {
  try { return Buffer.from(String(value || ''), 'base64url').toString('utf8').slice(0, maxLength); }
  catch { return ''; }
};
const webhookServer = createServer(async (req, res) => {
  const send = (status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(data)); };
  if (req.method === 'GET' && req.url === '/healthz') return send(200, { ok: true, service: 'whiskay-webhook', uptimeSeconds: Math.floor(process.uptime()) });

  // TEAMDROP sends raw document bytes to this private relay. The receiving JID and
  // the shared secret stay exclusively in server-side environment variables.
  if (req.method === 'POST' && req.url === '/webhooks/teamdrop/document') {
    const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!safeSecretMatch(supplied, teamdropWebhookSecret)) {
      req.resume();
      return send(teamdropWebhookSecret ? 401 : 503, { ok: false, error: teamdropWebhookSecret ? 'unauthorized' : 'teamdrop_not_configured' });
    }

    const ip = getTrustedClientAddress(req, { trustCloudflare: String(process.env.WHISKAY_WEBHOOK_TRUST_CF_CONNECTING_IP || '').toLowerCase() === 'true' });
    const configuredRateLimit = Number(process.env.TEAMDROP_WEBHOOK_RATE_LIMIT || 18);
    const rateLimit = Number.isFinite(configuredRateLimit) ? Math.max(1, Math.min(Math.floor(configuredRateLimit), 1000)) : 18;
    const rate = teamdropRate.consume(ip, rateLimit);
    if (!rate.allowed) {
      req.resume();
      return send(429, { ok: false, error: 'rate_limited', retryAfterSeconds: rate.retryAfterSeconds });
    }

    const eventId = String(req.headers['x-teamdrop-id'] || '').trim();
    if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(eventId)) {
      req.resume();
      return send(400, { ok: false, error: 'invalid_submission_id' });
    }

    const filenameRaw = decodeHeader(req.headers['x-teamdrop-filename'], 240);
    const filename = sanitizeDocumentFilename(filenameRaw);
    const mimetypeHeader = String(req.headers['x-teamdrop-mimetype'] || '').split(';')[0].trim().toLowerCase().slice(0, 120);
    const caption = decodeHeader(req.headers['x-teamdrop-caption'], 1200).replace(/[\r\0]/g, '').slice(0, 900);
    const extension = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';
    const allowedMimeByExtension = new Map([
      ['.pdf', 'application/pdf'], ['.doc', 'application/msword'],
      ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['.xls', 'application/vnd.ms-excel'],
      ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      ['.ppt', 'application/vnd.ms-powerpoint'],
      ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
      ['.txt', 'text/plain'], ['.csv', 'text/csv'], ['.odt', 'application/vnd.oasis.opendocument.text'],
      ['.ods', 'application/vnd.oasis.opendocument.spreadsheet'], ['.odp', 'application/vnd.oasis.opendocument.presentation'],
    ]);
    const expectedMime = allowedMimeByExtension.get(extension);
    if (!filename || !expectedMime) {
      req.resume();
      return send(400, { ok: false, error: 'unsupported_document_type' });
    }

    const configuredMaxMb = Number(process.env.TEAMDROP_MAX_FILE_MB || 50);
    const maxFileMb = Number.isFinite(configuredMaxMb) ? Math.max(1, Math.min(configuredMaxMb, 100)) : 50;
    const maxBytes = maxFileMb * 1024 * 1024;
    const declaredLength = parseContentLength(req.headers['content-length']);
    if (Number.isNaN(declaredLength)) {
      req.resume();
      return send(400, { ok: false, error: 'invalid_content_length' });
    }
    if (declaredLength !== null && declaredLength > maxBytes) {
      req.resume();
      return send(413, { ok: false, error: 'file_too_large' });
    }
    const configuredConcurrency = Number(process.env.TEAMDROP_MAX_CONCURRENT_UPLOADS || 2);
    const maxConcurrent = Number.isFinite(configuredConcurrency) ? Math.max(1, Math.min(4, Math.floor(configuredConcurrency))) : 2;
    if (teamdropInFlight >= maxConcurrent) {
      req.resume();
      return send(429, { ok: false, error: 'upload_capacity_reached', retryAfterSeconds: 5 });
    }
    teamdropInFlight++;

    const uploadRoot = path.resolve(process.env.WHISKAY_DATA_DIR || 'data', 'webhooks', 'teamdrop');
    const uploadPath = createWebhookTempPath(uploadRoot, extension);
    const teamdropEventKey = `teamdrop:${eventId}`;
    let teamdropClaimed = false;
    let uploaded = null;
    try {
      uploaded = await streamRequestToFile(req, uploadPath, { maxBytes, declaredLength });
      const signature = await validateDocumentFile(uploaded.file, extension);
      if (!signature.valid) return send(415, { ok: false, error: 'document_signature_mismatch' });
      const sock = bot.sock || bot.socket || bot.client;
      if (!sock || typeof sock.sendMessage !== 'function' || !sock.user?.id) return send(503, { ok: false, error: 'whatsapp_not_ready' });

      const configuredTarget = String(process.env.TEAMDROP_WHATSAPP_TO || process.env.OWNER_PHONE || String(process.env.OWNERS || '').split(',')[0] || '').trim();
      if (!configuredTarget) return send(503, { ok: false, error: 'teamdrop_recipient_not_configured' });
      let targetJid = configuredTarget;
      if (!targetJid.includes('@')) {
        const digits = targetJid.replace(/\D/g, '');
        if (!/^\d{8,15}$/.test(digits)) return send(503, { ok: false, error: 'whatsapp_recipient_not_configured' });
        targetJid = `${digits}@s.whatsapp.net`;
      }
      if (!/^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/.test(targetJid)) return send(503, { ok: false, error: 'whatsapp_recipient_not_configured' });

      const claim = await claimWebhookEvent(teamdropEventKey);
      if (!claim.claimed) return send(200, { ok: true, duplicate: true, messageId: null });
      teamdropClaimed = true;
      const result = await runWithOutboundContext({ source: 'webhook:teamdrop', command: 'teamdrop-webhook' }, () =>
        sock.sendMessage(targetJid, {
          document: createReadStream(uploaded.file),
          mimetype: expectedMime,
          fileName: filename,
          caption,
        }),
      );
      await completeWebhookEvent(teamdropEventKey, { outcome: 'sent', sent: 1, total: 1 });
      Logger.info({ submissionId: eventId, bytes: uploaded.bytes, signature: signature.kind, mimeHeaderMatched: !mimetypeHeader || mimetypeHeader === expectedMime, messageId: result?.key?.id || null }, 'TEAMDROP document streamed through Whiskay Bot');
      return send(200, { ok: true, duplicate: false, messageId: result?.key?.id || null });
    } catch (error) {
      if (teamdropClaimed) await completeWebhookEvent(teamdropEventKey, { outcome: 'failed', failed: 1, total: 1 }).catch(() => {});
      const status = error?.code === 'WHISKAY_PAYLOAD_TOO_LARGE' ? 413
        : ['WHISKAY_INVALID_CONTENT_LENGTH', 'WHISKAY_CONTENT_LENGTH_MISMATCH', 'WHISKAY_EMPTY_PAYLOAD'].includes(error?.code) ? 400 : 502;
      Logger.error({ submissionId: eventId, code: error?.code || 'unknown', err: error?.message || String(error) }, 'TEAMDROP document forwarding failed');
      return send(status, { ok: false, error: status === 413 ? 'file_too_large' : status === 400 ? 'invalid_document_payload' : 'whatsapp_send_failed' });
    } finally {
      await rm(uploadPath, { force: true }).catch(() => {});
      teamdropInFlight = Math.max(0, teamdropInFlight - 1);
    }
  }

  if (req.method !== 'POST' || req.url !== '/webhooks/world-boss') { req.resume(); return send(404, { ok: false, error: 'not_found' }); }
  recordWebhookRequest();
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!safeSecretMatch(supplied, webhookSecret)) { recordWebhookRejected('unauthorized'); req.resume(); return send(401, { ok: false, error: 'unauthorized' }); }
  if (String(process.env.WHISKAY_BOSS_WEBHOOK_ENABLED || 'false').toLowerCase() !== 'true') {
    recordWebhookRejected('webhook_disabled');
    req.resume();
    return send(503, { ok: false, error: 'webhook_disabled', message: 'World Boss announcements are disabled by default.' });
  }
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) { recordWebhookRejected('unsupported_content_type'); req.resume(); return send(415, { ok: false, error: 'unsupported_content_type' }); }
  const ip = getTrustedClientAddress(req, { trustCloudflare: String(process.env.WHISKAY_WEBHOOK_TRUST_CF_CONNECTING_IP || '').toLowerCase() === 'true' });
  const configuredRateLimit = Number(process.env.WHISKAY_WEBHOOK_RATE_LIMIT || 12);
  const rateLimit = Number.isFinite(configuredRateLimit) ? Math.max(1, Math.min(Math.floor(configuredRateLimit), 1000)) : 12;
  const rate = webhookRate.consume(ip, rateLimit);
  if (!rate.allowed) { recordWebhookRejected('rate_limited'); req.resume(); return send(429, { ok: false, error: 'rate_limited', retryAfterSeconds: rate.retryAfterSeconds }); }
  const declaredLength = parseContentLength(req.headers['content-length']);
  if (Number.isNaN(declaredLength)) { recordWebhookRejected('invalid_content_length'); req.resume(); return send(400, { ok: false, error: 'invalid_content_length' }); }
  if (declaredLength !== null && declaredLength > 8192) { recordWebhookRejected('payload_too_large'); req.resume(); return send(413, { ok: false, error: 'payload_too_large' }); }
  let rawBuffer;
  try {
    ({ buffer: rawBuffer } = await readRequestBuffer(req, { maxBytes: 8192, declaredLength }));
  } catch (error) {
    const tooLarge = error?.code === 'WHISKAY_PAYLOAD_TOO_LARGE';
    recordWebhookRejected(tooLarge ? 'payload_too_large' : 'invalid_payload');
    return send(tooLarge ? 413 : 400, { ok: false, error: tooLarge ? 'payload_too_large' : 'invalid_payload' });
  }
  let body;
  try { body = JSON.parse(rawBuffer.toString('utf8') || '{}'); }
  catch { recordWebhookRejected('invalid_json'); return send(400, { ok: false, error: 'invalid_json' }); }
  if (body.event !== 'world_boss_spawned') { recordWebhookRejected('invalid_event'); return send(400, { ok: false, error: 'invalid_event' }); }
  const eventId = String(body.eventId || '').trim();
  if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(eventId)) { recordWebhookRejected('invalid_event_id'); return send(400, { ok: false, error: 'invalid_event_id' }); }
  const worldBossEventKey = `world-boss:${eventId}`;
  let worldBossClaimed = false;
  try {
    const sock = bot.sock || bot.socket || bot.client;
    if (!sock || typeof sock.sendMessage !== 'function') { recordWebhookRejected('whatsapp_not_ready'); return send(503, { ok: false, error: 'whatsapp_not_ready' }); }
    await loadGroupMetadataStore();
    const participating = groupMetadataStore.all().map(group => group.id).filter(id => id.endsWith('@g.us'));
    const configuredTargets = String(process.env.WHISKAY_BOSS_TARGET_GROUPS || '').split(',').map(v => v.trim()).filter(v => /^\d{5,25}-\d{5,25}@g\.us$/.test(v));
    if (!configuredTargets.length) {
      recordWebhookRejected('target_allowlist_missing');
      return send(503, { ok: false, error: 'target_allowlist_missing', message: 'No WhatsApp group was selected; no messages were sent.' });
    }
    const maxTargetsValue = Number(process.env.WHISKAY_BOSS_MAX_TARGET_GROUPS || 5);
    const maxTargets = Number.isFinite(maxTargetsValue) ? Math.max(1, Math.min(5, Math.floor(maxTargetsValue))) : 5;
    const targets = participating.filter(id => configuredTargets.includes(id)).slice(0, maxTargets);
    if (!targets.length) {
      recordWebhookRejected('no_allowed_participating_targets');
      return send(503, { ok: false, error: 'no_allowed_participating_targets' });
    }
    const bossName = String(body.bossName || 'WORLD BOSS').replace(/[\r\n\t]/g, ' ').slice(0, 80);
    const floor = Number.isFinite(Number(body.floor)) ? Math.max(1, Math.min(999, Number(body.floor))) : null;
    const text = `🚨 ${bossName} MUNCUL DI DUNGEONIA!${floor ? `\n🏰 Lantai: ${floor}` : ''}\nGunakan .enterdungeon untuk bergabung!`;
    let sent = 0, failed = 0;
    // Persist the claim before the first WhatsApp side effect: retries stay at-most-once across restarts.
    const claim = await claimWebhookEvent(worldBossEventKey);
    if (!claim.claimed) return send(200, { ok: true, duplicate: true, sent: 0, failed: 0, total: 0 });
    worldBossClaimed = true;
    const deliveryInterval = Number(process.env.WHISKAY_BOSS_DELIVERY_INTERVAL_MS || 30000);
    const intervalMs = Number.isFinite(deliveryInterval) ? Math.max(30000, Math.min(180000, deliveryInterval)) : 30000;
    for (let index = 0; index < targets.length; index++) {
      const jid = targets[index];
      try { await runWithOutboundContext({ source: 'webhook:world-boss', command: 'world-boss-webhook' }, () => sock.sendMessage(jid, { text })); sent++; } catch { failed++; }
      if (index < targets.length - 1) await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    await completeWebhookEvent(worldBossEventKey, { outcome: sent > 0 && failed > 0 ? 'partial' : sent > 0 ? 'sent' : 'failed', sent, failed, total: targets.length });
    recordWebhookAccepted({ sent, failed, total: targets.length });
    Logger.info({ eventId: eventId || null, sent, failed, total: targets.length }, 'world boss webhook processed');
    return send(200, { ok: true, eventId: eventId || null, sent, failed, total: targets.length, targetMode: 'explicit-allowlist' });
  } catch (error) { if (worldBossClaimed) await completeWebhookEvent(worldBossEventKey, { outcome: 'failed', failed: 1, total: 1 }).catch(() => {}); recordWebhookRejected('broadcast_failed'); Logger.error({ err: error.message }, 'world boss webhook failed'); return send(500, { ok: false, error: 'broadcast_failed' }); }
});
webhookServer.headersTimeout = 15_000;
webhookServer.requestTimeout = Math.max(30_000, Math.min(900_000, Number(process.env.WHISKAY_WEBHOOK_REQUEST_TIMEOUT_MS || 300_000)));
webhookServer.keepAliveTimeout = 5_000;
webhookServer.maxRequestsPerSocket = 100;
webhookServer.on('error', error => Logger.error({ err: error.message }, 'world boss webhook server error'));
webhookServer.listen(webhookPort, process.env.WHISKAY_BOT_WEBHOOK_HOST || '0.0.0.0', () => Logger.info(`Webhook server listening on ${webhookPort}`));

try {
  // Portal stays on the bot's Node process. Local developer environments may use
  // a temporary TryCloudflare URL; server/deployment environments must supply a public URL.
  const portal = await startPairingPortal().catch(error => { Logger.error(`Pairing portal failed to start: ${error.message}`); return { ok: false, mode: 'failed' }; });
  Logger.info(`Jadibot pairing portal: ${portal.url || '(URL belum tersedia)'} [${portal.mode || 'unknown'}]`);
  // The World Boss webhook uses its own Quick Tunnel because the Jadibot portal
  // runs on a different local port. Tunnel retries in the background and does
  // not prevent the WhatsApp bot from starting.
  const worldBossTunnel = await startWorldBossTunnel();
  Logger.info({ mode: worldBossTunnel.mode, endpoint: worldBossTunnel.endpoint || '(menunggu URL)' }, 'World Boss tunnel startup');
  await bot.start();
} catch (e) {
  Logger.fatal(`Failed to start: ${e.message}`);
  process.exit(1);
}

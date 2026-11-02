import 'dotenv/config';
import Logger from './core/Logger.js';
import { Bot } from './core/Bot.js';
import { CrashGuard } from './core/CrashGuard.js';
import { registry } from './core/registry.js';
import { createServer } from 'node:http';
import { startPairingPortal, stopPairingPortal, setBotNumberProvider } from './services/jadibotPortal.js';
import { startWorldBossTunnel, stopWorldBossTunnel, onWorldBossTunnel } from './services/worldBossTunnel.js';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { recordWebhookRequest, recordWebhookRejected, recordWebhookAccepted, wasEventSeen, markEventSeen, getWebhookRuntimeStats } from './services/webhookRuntime.js';
import { EnvHotReloader } from './core/EnvHotReloader.js';

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
const webhookRate = new Map();
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
    if (!safeSecretMatch(supplied, teamdropWebhookSecret)) { req.resume(); return send(teamdropWebhookSecret ? 401 : 503, { ok: false, error: teamdropWebhookSecret ? 'unauthorized' : 'teamdrop_not_configured' }); }

    const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown');
    const now = Date.now();
    const previous = webhookRate.get(`teamdrop:${ip}`) || { start: now, count: 0 };
    if (now - previous.start >= 60_000) { previous.start = now; previous.count = 0; }
    previous.count++;
    webhookRate.set(`teamdrop:${ip}`, previous);
    const configuredRateLimit = Number(process.env.TEAMDROP_WEBHOOK_RATE_LIMIT || 18);
    const limit = Number.isFinite(configuredRateLimit) ? Math.max(1, Math.min(configuredRateLimit, 1000)) : 18;
    if (previous.count > limit) { req.resume(); return send(429, { ok: false, error: 'rate_limited' }); }

    const eventId = String(req.headers['x-teamdrop-id'] || '').trim();
    if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(eventId)) { req.resume(); return send(400, { ok: false, error: 'invalid_submission_id' }); }
    if (wasEventSeen(`teamdrop:${eventId}`)) { req.resume(); return send(200, { ok: true, duplicate: true, messageId: null }); }

    const filenameRaw = decodeHeader(req.headers['x-teamdrop-filename'], 240);
    const filename = filenameRaw.replace(/[\\/\r\n\0]/g, '_').trim();
    const mimetype = String(req.headers['x-teamdrop-mimetype'] || 'application/octet-stream').split(';')[0].trim().toLowerCase().slice(0, 120);
    const caption = decodeHeader(req.headers['x-teamdrop-caption'], 1200).replace(/[\r\0]/g, '').slice(0, 900);
    const extension = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';
    const allowed = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.odt', '.ods', '.odp']);
    if (!filename || !allowed.has(extension)) { req.resume(); return send(400, { ok: false, error: 'unsupported_document_type' }); }

    const configuredMaxMb = Number(process.env.TEAMDROP_MAX_FILE_MB || 50);
    const maxFileMb = Number.isFinite(configuredMaxMb) ? Math.max(1, Math.min(configuredMaxMb, 100)) : 50;
    const maxBytes = maxFileMb * 1024 * 1024;
    const declaredLength = Number(req.headers['content-length'] || 0);
    if (declaredLength > maxBytes) { req.resume(); return send(413, { ok: false, error: 'file_too_large' }); }

    try {
      const chunks = [];
      let totalBytes = 0;
      let tooLarge = false;
      for await (const chunk of req) {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) { tooLarge = true; continue; }
        chunks.push(chunk);
      }
      if (tooLarge || totalBytes === 0) return send(tooLarge ? 413 : 400, { ok: false, error: tooLarge ? 'file_too_large' : 'empty_file' });

      const sock = bot.sock || bot.socket || bot.client;
      if (!sock || typeof sock.sendMessage !== 'function' || !sock.user?.id) return send(503, { ok: false, error: 'whatsapp_not_ready' });

      const configuredTarget = String(process.env.TEAMDROP_WHATSAPP_TO || process.env.OWNER_PHONE || String(process.env.OWNERS || '').split(',')[0] || '').trim();
      let targetJid = sock.user.id;
      if (configuredTarget) {
        if (configuredTarget.includes('@')) {
          targetJid = configuredTarget;
        } else {
          const digits = configuredTarget.replace(/\D/g, '');
          if (!/^\d{8,15}$/.test(digits)) return send(503, { ok: false, error: 'whatsapp_recipient_not_configured' });
          targetJid = `${digits}@s.whatsapp.net`;
        }
        if (!/^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/.test(targetJid)) return send(503, { ok: false, error: 'whatsapp_recipient_not_configured' });
      }
      if (!targetJid || !targetJid.includes('@')) return send(503, { ok: false, error: 'whatsapp_recipient_not_configured' });

      const document = Buffer.concat(chunks, totalBytes);
      const result = await sock.sendMessage(targetJid, {
        document,
        mimetype: mimetype || 'application/octet-stream',
        fileName: filename,
        caption
      });
      markEventSeen(`teamdrop:${eventId}`);
      Logger.info({ submissionId: eventId, bytes: totalBytes, recipientConfigured: Boolean(configuredTarget), messageId: result?.key?.id || null }, 'TEAMDROP document forwarded through Whiskay Bot');
      return send(200, { ok: true, duplicate: false, messageId: result?.key?.id || null });
    } catch (error) {
      Logger.error({ submissionId: eventId, err: error?.message || String(error) }, 'TEAMDROP document forwarding failed');
      return send(502, { ok: false, error: 'whatsapp_send_failed' });
    }
  }

  if (req.method !== 'POST' || req.url !== '/webhooks/world-boss') return send(404, { ok: false, error: 'not_found' });
  recordWebhookRequest();
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!safeSecretMatch(supplied, webhookSecret)) { recordWebhookRejected('unauthorized'); return send(401, { ok: false, error: 'unauthorized' }); }
  const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown');
  const now = Date.now(); const windowMs = 60_000; const limit = Math.max(1, Number(process.env.WHISKAY_WEBHOOK_RATE_LIMIT || 12));
  const previous = webhookRate.get(ip) || { start: now, count: 0 };
  if (now - previous.start >= windowMs) { previous.start = now; previous.count = 0; }
  previous.count++; webhookRate.set(ip, previous);
  if (previous.count > limit) { recordWebhookRejected('rate_limited'); return send(429, { ok: false, error: 'rate_limited', retryAfterSeconds: Math.ceil((windowMs - (now - previous.start)) / 1000) }); }
  let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw, 'utf8') > 8192) { recordWebhookRejected('payload_too_large'); return send(413, { ok: false, error: 'payload_too_large' }); } }
  let body; try { body = JSON.parse(raw || '{}'); } catch { recordWebhookRejected('invalid_json'); return send(400, { ok: false, error: 'invalid_json' }); }
  if (body.event !== 'world_boss_spawned') { recordWebhookRejected('invalid_event'); return send(400, { ok: false, error: 'invalid_event' }); }
  const eventId = String(body.eventId || '').trim();
  if (eventId && !/^[a-zA-Z0-9._:-]{8,128}$/.test(eventId)) { recordWebhookRejected('invalid_event_id'); return send(400, { ok: false, error: 'invalid_event_id' }); }
  if (eventId && wasEventSeen(eventId)) return send(200, { ok: true, duplicate: true, sent: 0, failed: 0, total: 0 });
  try {
    const sock = bot.sock || bot.socket || bot.client;
    if (!sock || typeof sock.sendMessage !== 'function') { recordWebhookRejected('whatsapp_not_ready'); return send(503, { ok: false, error: 'whatsapp_not_ready' }); }
    await loadGroupMetadataStore();
    const participating = groupMetadataStore.all().map(group => group.id).filter(id => id.endsWith('@g.us'));
    const configuredTargets = String(process.env.WHISKAY_BOSS_TARGET_GROUPS || '').split(',').map(v => v.trim()).filter(v => v.endsWith('@g.us'));
    const targets = configuredTargets.length ? participating.filter(id => configuredTargets.includes(id)) : participating;
    const bossName = String(body.bossName || 'WORLD BOSS').replace(/[\r\n\t]/g, ' ').slice(0, 80);
    const floor = Number.isFinite(Number(body.floor)) ? Math.max(1, Math.min(999, Number(body.floor))) : null;
    const text = `🚨 ${bossName} MUNCUL DI DUNGEONIA!${floor ? `\n🏰 Lantai: ${floor}` : ''}\nGunakan .enterdungeon untuk bergabung!`;
    let sent = 0, failed = 0;
    for (const jid of targets) { try { await sock.sendMessage(jid, { text }); sent++; } catch { failed++; } }
    if (eventId && sent > 0) markEventSeen(eventId);
    recordWebhookAccepted({ sent, failed, total: targets.length });
    Logger.info({ eventId: eventId || null, sent, failed, total: targets.length }, 'world boss webhook processed');
    return send(200, { ok: true, eventId: eventId || null, sent, failed, total: targets.length, targetMode: configuredTargets.length ? 'allowlist' : 'all-participating-groups' });
  } catch (error) { recordWebhookRejected('broadcast_failed'); Logger.error({ err: error.message }, 'world boss webhook failed'); return send(500, { ok: false, error: 'broadcast_failed' }); }
});
webhookServer.on('error', error => Logger.error({ err: error.message }, 'world boss webhook server error'));
webhookServer.listen(webhookPort, process.env.WHISKAY_BOT_WEBHOOK_HOST || '0.0.0.0', () => Logger.info(`World Boss webhook listening on ${webhookPort}`));

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

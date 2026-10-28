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

const guard = new CrashGuard({
  maxCrashes: 5,
  windowMs: 60_000,
  onFatal: () => Logger.fatal('Terminating due to crash loop — check logs and restart.')
}).install();

const bot = new Bot();
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
const webhookPort = Number(process.env.WHISKAY_BOT_WEBHOOK_PORT || 8787);
const webhookRate = new Map();
const safeSecretMatch = supplied => {
  const a = Buffer.from(String(supplied || ''));
  const b = Buffer.from(webhookSecret);
  return Boolean(webhookSecret) && a.length === b.length && timingSafeEqual(a, b);
};
const webhookServer = createServer(async (req, res) => {
  const send = (status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(data)); };
  if (req.method === 'GET' && req.url === '/healthz') return send(200, { ok: true, service: 'whiskay-world-boss-webhook', uptimeSeconds: Math.floor(process.uptime()) });
  if (req.method !== 'POST' || req.url !== '/webhooks/world-boss') return send(404, { ok: false, error: 'not_found' });
  recordWebhookRequest();
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!safeSecretMatch(supplied)) { recordWebhookRejected('unauthorized'); return send(401, { ok: false, error: 'unauthorized' }); }
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
    if (!sock || typeof sock.groupFetchAllParticipating !== 'function' || typeof sock.sendMessage !== 'function') { recordWebhookRejected('whatsapp_not_ready'); return send(503, { ok: false, error: 'whatsapp_not_ready' }); }
    const groups = await sock.groupFetchAllParticipating();
    const configuredTargets = String(process.env.WHISKAY_BOSS_TARGET_GROUPS || '').split(',').map(v => v.trim()).filter(v => v.endsWith('@g.us'));
    const participating = Object.keys(groups || {}).filter(id => id.endsWith('@g.us'));
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

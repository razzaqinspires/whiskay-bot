import 'dotenv/config';
import Logger from './core/Logger.js';
import { Bot } from './core/Bot.js';
import { CrashGuard } from './core/CrashGuard.js';
import { registry } from './core/registry.js';
import { createServer } from 'node:http';

const guard = new CrashGuard({
  maxCrashes: 5,
  windowMs: 60_000,
  onFatal: () => Logger.fatal('Terminating due to crash loop — check logs and restart.')
}).install();

const bot = new Bot();
registry.bot = bot;

let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  Logger.info(`Received ${signal}, shutting down...`);
  await new Promise(resolve => webhookServer.close(resolve));
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
const webhookServer = createServer(async (req, res) => {
  const send = (status, data) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };
  if (req.method !== 'POST' || req.url !== '/webhooks/world-boss') return send(404, { ok: false, error: 'not_found' });
  if (!webhookSecret || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() !== webhookSecret) return send(401, { ok: false, error: 'unauthorized' });
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 8192) return send(413, { ok: false, error: 'payload_too_large' }); }
  let body; try { body = JSON.parse(raw || '{}'); } catch { return send(400, { ok: false, error: 'invalid_json' }); }
  if (body.event !== 'world_boss_spawned') return send(400, { ok: false, error: 'invalid_event' });
  try {
    const sock = bot.sock || bot.socket || bot.client;
    if (!sock || typeof sock.groupFetchAllParticipating !== 'function' || typeof sock.sendMessage !== 'function') return send(503, { ok: false, error: 'whatsapp_not_ready' });
    const groups = await sock.groupFetchAllParticipating(); const targets = Object.keys(groups || {}).filter(id => id.endsWith('@g.us'));
    let sent = 0, failed = 0;
    for (const jid of targets) { try { await sock.sendMessage(jid, { text: '🚨 WORLD BOSS MUNCUL DI DUNGEONIA! Gunakan .enterdungeon untuk bergabung!' }); sent++; } catch { failed++; } }
    return send(200, { ok: true, sent, failed, total: targets.length });
  } catch (error) { Logger.error({ err: error.message }, 'world boss webhook failed'); return send(500, { ok: false, error: 'broadcast_failed' }); }
});
webhookServer.on('error', error => Logger.error({ err: error.message }, 'world boss webhook server error'));
webhookServer.listen(webhookPort, process.env.WHISKAY_BOT_WEBHOOK_HOST || '0.0.0.0', () => Logger.info(`World Boss webhook listening on ${webhookPort}`));

try {
  await bot.start();
} catch (e) {
  Logger.fatal(`Failed to start: ${e.message}`);
  process.exit(1);
}

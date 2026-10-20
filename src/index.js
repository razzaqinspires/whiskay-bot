import 'dotenv/config';
import Logger from './core/Logger.js';
import { Bot } from './core/Bot.js';
import { CrashGuard } from './core/CrashGuard.js';
import { registry } from './core/registry.js';

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
  try { await bot.stop(); } catch (e) { Logger.error(`Shutdown: ${e.message}`); }
  process.exit(0);
};

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('SIGUSR2', async () => {
  Logger.info('SIGUSR2 → triggering plugin reload');
  try { await bot.reloadQueue.push('signal'); } catch {}
});

try {
  await bot.start();
} catch (e) {
  Logger.fatal(`Failed to start: ${e.message}`);
  process.exit(1);
}

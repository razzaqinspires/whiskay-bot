import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-stage69-energy-'));
process.env.WHISKAY_DATA_DIR = dir;

test('fixed-cost command debits the persistent energy ledger atomically', async () => {
  const energy = await import('../src/lib/energy-worker.js');
  await energy.resetBattery('6281234567890@s.whatsapp.net', 50);
  const before = await energy.getEnergy('6281234567890@s.whatsapp.net');
  const receipt = await energy.consumeEnergy('6281234567890@s.whatsapp.net', 'wmsearch one piece', 1.25);
  const after = await energy.getEnergy('6281234567890@s.whatsapp.net');
  assert.equal(receipt.ok, true);
  assert.equal(receipt.cost, 1.25);
  assert.equal(after.energy, 48.75);
  assert.equal(after.totalSpent, Number((before.totalSpent + 1.25).toFixed(2)));
  assert.equal(after.commands, before.commands + 1);
});

test('workload policy charges Westmanga network and download commands', async () => {
  const { estimateWorkload } = await import('../src/core/WorkloadCortex.js');
  for (const command of ['wmhome','wmsearch','wmdetail','wmread','wmdownload']) {
    const result = estimateWorkload({ command, plugin: { workload: command === 'wmdownload' ? 'heavy' : 'network' } });
    assert.ok(result.cost > 0, `${command} must not be free`);
    assert.notEqual(result.mode, 'exempt');
  }
});

test('free commands do not display a misleading 0.00 percent number', async () => {
  const source = await readFile(new URL('../src/plugins/general/menu.js', import.meta.url), 'utf8');
  assert.match(source, /settings\.showEnergyNumbers && policy\.mode!=='exempt'/);
});

test('setmenu re-enables energy notification without leaving delivery mode hidden', async () => {
  const source = await readFile(new URL('../src/plugins/general/setmenu.js', import.meta.url), 'utf8');
  assert.match(source, /action==='energy-notice'&&\['on','off'\]\.includes\(value\)/);
  assert.match(source, /s\.batteryNotification==='hide'\)patch\.batteryNotification='separate'/);
  assert.match(source, /action==='energy-xp'/);
});

test('separate notification includes both energy debit and XP after command completion', async () => {
  const { updateMenuSettings } = await import('../src/lib/menu-settings.js');
  const { default: energyWorker } = await import('../src/middlewares/energy-worker.js');
  await updateMenuSettings('test-user', {
    batteryNotification: 'separate',
    energyNotificationEnabled: true,
    xpNotificationEnabled: true,
  });
  const sent = [];
  const ctx = {
    command: 'wmsearch', args: ['one','piece'], sender: 'test-user', chat: 'test-chat',
    prefix: '.', plugin: { workload: 'network', cooldown: 1000 }, isBot: false,
    reply: async value => { sent.push({ type: 'reply', value }); },
    send: async value => { sent.push({ type: 'send', value }); },
    sendInteractive: async payload => { sent.push({ type: 'interactive', payload }); },
  };
  const before = await (await import('../src/lib/energy-worker.js')).getEnergy('test-user');
  await energyWorker(ctx, async () => true);
  const afterDebit = await (await import('../src/lib/energy-worker.js')).getEnergy('test-user');
  assert.ok(afterDebit.energy < before.energy, 'middleware must debit energy before executing the command');
  ctx.xpAward = { gain: 3, profile: { level: 1 } };
  await ctx.completeEnergyTelemetry({ durationMs: 120, ok: true });
  const notice = sent.find(item => item.type === 'interactive' && /Status Energi & XP/.test(item.payload.title));
  assert.ok(notice, 'combined energy and XP card should be sent');
  assert.match(notice.payload.body, /baterai digunakan/);
  assert.match(notice.payload.body, /\+3 XP diperoleh/);
});

test('merge mode preserves XP awarded after the command response was sent', async () => {
  const { updateMenuSettings } = await import('../src/lib/menu-settings.js');
  const { default: energyWorker } = await import('../src/middlewares/energy-worker.js');
  await updateMenuSettings('merge-user', { batteryNotification: 'merge', energyNotificationEnabled: true, xpNotificationEnabled: true });
  const sent = [];
  const ctx = {
    command: 'wmsearch', args: ['naruto'], sender: 'merge-user', chat: 'merge-chat',
    prefix: '.', plugin: { workload: 'network' }, isBot: false,
    reply: async value => { sent.push(String(value)); },
    send: async value => { sent.push(String(value)); },
    sendInteractive: async payload => { sent.push(payload); },
  };
  await energyWorker(ctx, async () => true);
  await ctx.reply('Search result');
  ctx.xpAward = { gain: 2, profile: { level: 1 } };
  await ctx.completeEnergyTelemetry({ durationMs: 90, ok: true });
  assert.ok(sent.some(value => typeof value === 'string' && /baterai digunakan/.test(value)));
  assert.ok(sent.some(value => typeof value === 'string' && /\+2 XP diperoleh/.test(value)));
});

test('download guard rejects non-HTTPS, untrusted hosts and credential URLs', async () => {
  const { validateWestmangaDownloadUrl } = await import('../src/services/WestmangaDownloadGuard.js');
  await assert.rejects(() => validateWestmangaDownloadUrl('http://v1.westmanga.my/image.jpg', { resolveDns: false }), /HTTPS/);
  await assert.rejects(() => validateWestmangaDownloadUrl('https://evil.example/image.jpg', { resolveDns: false }), /Host CDN tidak diizinkan/);
  await assert.rejects(() => validateWestmangaDownloadUrl('https://user:pass@v1.westmanga.my/image.jpg', { resolveDns: false }), /kredensial/);
  const valid = await validateWestmangaDownloadUrl('https://v1.westmanga.my/storage/page.webp', { resolveDns: false });
  assert.equal(valid.hostname, 'v1.westmanga.my');
});

test('source library remains unchanged and command aliases are registered', async () => {
  const controller = await readFile(new URL('../src/services/WestmangaLibraryController.js', import.meta.url), 'utf8');
  const plugin = await readFile(new URL('../src/plugins/general/westmanga.js', import.meta.url), 'utf8');
  assert.match(controller, /westmangaDownload/);
  for (const command of ['wm','wmhome','wmsearch','wmdetail','wmread','wmdownload']) assert.ok(plugin.includes(command));
  const source = await readFile(new URL('../src/lib/external/westmanga/westmanga-scraper.cjs', import.meta.url), 'utf8');
  assert.match(source, /Westmanga Scraper & API Client/);
});

test('cleanup', async () => { await rm(dir, { recursive: true, force: true }); });

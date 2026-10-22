import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderMenuCardV2, renderProfileCardV2 } from '../src/services/canvas-v2.js';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

test('Stage 19 menu has category spacing and dynamic RPG/leaderboard/hit widgets', async () => {
  const menu = await read('../src/plugins/general/menu.js');
  const settings = await read('../src/plugins/general/setmenu.js');
  assert.match(menu, /lines\.push\('',line\(settings,`〔/);
  for (const widget of ['rpgstatus', 'leaderboard', 'commandhits']) assert.ok(menu.includes(widget) && settings.includes(widget));
  assert.match(settings, /value==='random'/);
  assert.match(settings, /themeFont/);
});

test('Stage 19 timed charging math and charging lock are documented in runtime code', async () => {
  const energy = await read('../src/lib/energy-worker.js');
  const middleware = await read('../src/middlewares/energy-worker.js');
  const plugin = await read('../src/plugins/owner/energy-system.js');
  assert.match(energy, /252000/); // 4.2 minutes per percentage point
  assert.match(energy, /chargingEndsAt/);
  assert.match(energy, /setInterval\(async \(\) =>/);
  assert.match(middleware, /Peringatan CPU: Cabut charger/);
  assert.ok(plugin.includes("ctx.command==='statusbaterai'") && plugin.includes("ctx.command==='setenergy'"));
});

test('Card Canvas V2 emits PNG buffers for landscape menu and portrait profile', async () => {
  const menu = await renderMenuCardV2({ botName: 'TEST WHISKAY' });
  const profile = await renderProfileCardV2({ profile: { level: 7, xp: 12, coin: 50 }, rank: 'Bronze', role: 'Player', progress: 20, nextXp: 100 });
  for (const buffer of [menu, profile]) {
    assert.ok(Buffer.isBuffer(buffer));
    assert.equal(buffer.subarray(1, 4).toString(), 'PNG');
  }
});

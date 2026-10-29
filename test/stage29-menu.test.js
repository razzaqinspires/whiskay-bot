import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultMenuSettings } from '../src/lib/menu-settings.js';
import { readFile } from 'node:fs/promises';

test('Stage 29 menu defaults keep symbols independent and recommendation enabled', () => {
  const settings = defaultMenuSettings();
  assert.equal(settings.showWidgetSymbols, true);
  assert.equal(settings.recommendationEnabled, true);
  assert.equal(settings.menuResponseMode, 'classic');
  assert.equal(settings.forwardedLabelMode, 'full');
  assert.ok(settings.widgets.includes('rpgstatus'));
});

test('Stage 29 exposes configurable quote demo fields without treating them as identity proof', () => {
  const settings = defaultMenuSettings();
  assert.equal(settings.fakeContactName, 'Whiskay Contact Demo');
  assert.equal(settings.fakeContactNumber, '6280000000000');
  assert.equal(settings.fakeProductName, 'Whiskay Demo Product');
  assert.equal(settings.fakeProductPrice, 'Rp10.000');
});

test('Stage 29 hides group identifiers in battery dashboard output', async () => {
  const source = await readFile(new URL('../src/plugins/owner/battery-dashboard.js', import.meta.url), 'utf8');
  assert.match(source, /endsWith\('@g\.us'\)/);
  assert.match(source, /dikecualikan dari tampilan/);
});

test('Stage 29 menu has three settings actions and recommendation global control', async () => {
  const source = await readFile(new URL('../src/plugins/general/menu.js', import.meta.url), 'utf8');
  assert.match(source, /Desain menu berbantuan AI/);
  assert.match(source, /Mode respon menu/);
  assert.match(source, /getGlobalRecommendationsEnabled/);
});

test('Stage 29 status canvas is landscape and has V1/V2 controls', async () => {
  const renderer = await readFile(new URL('../src/services/canvas-v2.js', import.meta.url), 'utf8');
  const status = await readFile(new URL('../src/plugins/owner/energy-system.js', import.meta.url), 'utf8');
  assert.match(renderer, /width="1200" height="675"/);
  assert.match(status, /status canvas v1/);
  assert.match(status, /status canvas v2/);
});

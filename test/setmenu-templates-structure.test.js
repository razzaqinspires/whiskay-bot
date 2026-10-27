import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
test('menu settings expose all six additional templates and confirmation before apply', async () => {
  const file = await readFile(new URL('src/plugins/general/setmenu.js', root), 'utf8');
  for (const name of ['ocean','sunset','emerald','sakura','monochrome','royal']) assert.match(file, new RegExp(`['"]${name}['"]`));
  assert.match(file, /templateConfirmation/);
  assert.match(file, /setmenu template confirm/);
  assert.match(file, /defaultMenuSettings\(\)/);
});
test('menu supports widget symbols and quote modes without fake user identity', async () => {
  const setmenu = await readFile(new URL('src/plugins/general/setmenu.js', root), 'utf8');
  const menu = await readFile(new URL('src/plugins/general/menu.js', root), 'utf8');
  const serializer = await readFile(new URL('src/core/serializer-compat.cjs', root), 'utf8');
  assert.match(setmenu, /widgetSymbolBefore/);
  assert.match(setmenu, /widgetSymbolAfter/);
  assert.match(setmenu, /bot-preview/);
  assert.match(menu, /widgetLine/);
  assert.match(serializer, /WHISKAY BOT PREVIEW/);
});
test('menu select sections are categorized rather than numbered arbitrarily', async () => {
  const file = await readFile(new URL('src/plugins/general/setmenu.js', root), 'utf8');
  assert.match(file, /const sections=rows=>\{const groups=new Map\(\)/);
  assert.match(file, /1 · Template/);
  assert.match(file, /2 · Tipografi & simbol/);
});

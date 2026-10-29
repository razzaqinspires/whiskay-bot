import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');

test('setmenu order action opens an interactive picker and accepts category/A-Z/Z-A', async () => {
  const source = await read('../src/plugins/general/setmenu.js');
  assert.ok(source.includes("action==='order'&&!value"));
  for (const order of ['category', 'az', 'za']) assert.ok(source.includes(`setmenu order ${order}`));
});

test('command rows place command and access symbols before a single energy suffix', async () => {
  const source = await read('../src/plugins/general/menu.js');
  assert.ok(source.includes("${String(index+1).padStart(2,'0')}. ${ctx.prefix}${row.command}${mark}${accessMarks}${energySuffix}"));
  assert.ok(source.includes("settings.widgetNumbering?`${widgetIndex+1}. ${widgetLines[id]}`:widgetLines[id]"));
  assert.match(source, /const energySuffix=showEnergy/);
  assert.doesNotMatch(source, /padStart\(2,'0'\)\. \$\{settings\.showEnergyEmoji/);
});

test('menu has five additional operational widgets and two new templates', async () => {
  const setmenu = await read('../src/plugins/general/setmenu.js');
  const menu = await read('../src/plugins/general/menu.js');
  for (const name of ['neon', 'zen', 'biocore', 'events', 'messages', 'uptime', 'database']) assert.ok(setmenu.includes(name), `missing ${name}`);
  for (const name of ['biocore', 'events', 'messages', 'uptime', 'database']) assert.ok(menu.includes(name), `renderer missing ${name}`);
});

test('owner tester is owner-restricted and offers save/discard buttons', async () => {
  const source = await read('../src/plugins/owner/testcommands.js');
  assert.match(source, /owner: true/);
  assert.match(source, /testcommands save/);
  assert.match(source, /testcommands discard/);
  assert.match(source, /README\.md/);
});

test('fake quote previews are labelled and do not choose third-party personas', async () => {
  const source = await read('../src/core/serializer-compat.cjs');
  assert.match(source, /SYNTHETIC QUOTE PREVIEW/);
  assert.match(source, /displayName: type === 'contact' \? String\(options\.fakeContactName \|\| 'WHISKAY BOT · PREVIEW'\) : 'WHISKAY BOT · PREVIEW'/);
  assert.match(source, /const allowed = new Set/);
});

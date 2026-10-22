import test from 'node:test';
import assert from 'node:assert/strict';
import plugin from '../src/plugins/games/rpg-sync.js';

test('RPG sync is registered with the native Whiskay plugin contract', () => {
  assert.equal(plugin.name, 'rpg-sync');
  assert.deepEqual(plugin.command, ['rpgsync']);
  assert.equal(typeof plugin.execute, 'function');
  assert.ok(Array.isArray(plugin.aliases));
});

test('RPG sync does not expose phone identifiers or tokens in its command surface', async () => {
  const oldUrl = process.env.DUNGEON_WEBSITE_URL;
  delete process.env.DUNGEON_WEBSITE_URL;
  let message = '';
  try {
    await plugin.execute({ reply: async value => { message = value; } });
  } finally {
    if (oldUrl === undefined) delete process.env.DUNGEON_WEBSITE_URL;
    else process.env.DUNGEON_WEBSITE_URL = oldUrl;
  }
  assert.match(message, /DUNGEON_WEBSITE_URL/);
  assert.doesNotMatch(message, /Bearer\s+[A-Za-z0-9_-]{20,}/);
});

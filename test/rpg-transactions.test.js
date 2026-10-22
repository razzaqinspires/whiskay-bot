import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const daily = await readFile(new URL('../src/plugins/games/rpg-daily.js', import.meta.url), 'utf8');
const shop = await readFile(new URL('../src/plugins/games/rpg-buy.js', import.meta.url), 'utf8');
test('daily plugin follows native plugin contract and calls daily API', () => {
  assert.match(daily, /name: 'rpg-daily'/);
  assert.match(daily, /command: \['daily'\]/);
  assert.match(daily, /\/api\/player\/daily/);
  assert.match(daily, /dashboardPlayerId\(ctx\.chat, ctx\.sender\)/);
  assert.match(daily, /try \{/);
});
test('shop plugin validates potion and calls shop API', () => {
  assert.match(shop, /name: 'rpg-buy'/);
  assert.match(shop, /command: \['buy'\]/);
  assert.match(shop, /\/api\/player\/shop/);
  assert.match(shop, /insufficient_gold/);
  assert.match(shop, /dashboardPlayerId\(ctx\.chat, ctx\.sender\)/);
});

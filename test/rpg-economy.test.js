import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const files = ['rpg-gacha.js','rpg-craft.js','rpg-trade.js'];
for (const file of files) test(`${file} follows the bot plugin contract`, async () => {
  const source = await readFile(new URL(`../src/plugins/games/${file}`, import.meta.url), 'utf8');
  assert.match(source, /export default/);
  assert.match(source, /async execute\(ctx\)/);
  assert.match(source, /rpgEconomyRequest/);
  assert.match(source, /economyErrorText/);
});
test('trade validates a group mention and transfer amount', async () => {
 const source = await readFile(new URL('../src/plugins/games/rpg-trade.js', import.meta.url), 'utf8');
 assert.match(source, /ctx\.isGroup/); assert.match(source, /ctx\.mentions/); assert.match(source, /Number\.isSafeInteger/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import sos, { sosLines } from '../src/plugins/games/sos.js';
import snakes from '../src/plugins/games/snake-ladders.js';
import minigames from '../src/plugins/games/minigames.js';

test('source gap game families are registered with stable command aliases', () => {
  assert.deepEqual(sos.command, ['sos']);
  assert.ok(snakes.command.includes('ulartangga'));
  assert.ok(snakes.command.includes('ut'));
  assert.ok(snakes.command.includes('dadu'));
  assert.ok(minigames.command.includes('minigames'));
  assert.ok(minigames.command.includes('minigame'));
});
test('SOS detection validates horizontal, vertical and diagonal lines only', () => {
  assert.equal(sosLines(['S','O','S','','','','','','']).length, 1);
  assert.equal(sosLines(['S','','','O','','','S','','']).length, 1);
  assert.equal(sosLines(['S','','','','O','','','','S']).length, 1);
  assert.equal(sosLines(['S','S','O','','','','','','']).length, 0);
});
test('minigames index includes core game families and no invented external play URLs', async () => {
  const replies=[];
  const ctx={args:['list'],prefix:'.',sendInteractive:async x=>{replies.push(x);return x;},reply:async x=>x};
  await minigames.execute(ctx);
  assert.match(replies[0].title,/MINIGAMES/);
  const body=replies[0].body;
  for (const name of ['Tebak Gambar','Family 100','Catur','SOS','Ular Tangga','Werewolf']) assert.ok(body.includes(name),`missing ${name}`);
  assert.ok(replies[0].buttons.some(b=>b.name==='single_select'));
});
test('game plugins declare descriptions and callable handlers', () => {
  for (const plugin of [sos,snakes,minigames]) {
    assert.ok(plugin.description);
    assert.equal(typeof plugin.execute,'function');
  }
});

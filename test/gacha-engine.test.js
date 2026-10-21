import test from 'node:test';
import assert from 'node:assert/strict';
import { GACHA_POOL, GACHA_RATES, getGachaRarity, rollGacha } from '../src/lib/gacha-engine.js';

test('banner rates and rarity thresholds are explicit', () => {
  assert.equal(GACHA_RATES.SSR, 0.03);
  assert.equal(GACHA_RATES.SR, 0.17);
  assert.equal(GACHA_RATES.R, 0.80);
  assert.equal(getGachaRarity(0.01, 0), 'SSR');
  assert.equal(getGachaRarity(0.10, 0), 'SR');
  assert.equal(getGachaRarity(0.70, 0), 'R');
});

test('hard pity guarantees an SSR on the 50th unsuccessful pull', () => {
  assert.equal(getGachaRarity(0.99, 49), 'SSR');
  const result = rollGacha(1, 49, () => 0.99);
  assert.equal(result.pulls[0].rarity, 'SSR');
  assert.equal(result.pity, 0);
});

test('ten-pull returns ten valid spirits and advances pity correctly', () => {
  const values = [0.5,0, 0.1,0, 0.5,0, 0.5,0, 0.5,0, 0.5,0, 0.5,0, 0.5,0, 0.5,0, 0.5,0];
  let i = 0;
  const result = rollGacha(10, 0, () => values[i++ % values.length]);
  assert.equal(result.pulls.length, 10);
  assert.ok(result.pulls.every(item => GACHA_POOL.some(poolItem => poolItem.id === item.id)));
  assert.equal(result.pity, 10); // no SSR was rolled, so pity increases once per pull
  assert.equal(result.pulls[1].rarity, 'SR');
});

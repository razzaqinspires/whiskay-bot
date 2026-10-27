import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEggTransaction } from '../src/lib/egg-calculator.js';

test('calculates whole eggs, total and change', () => {
  assert.deepEqual(calculateEggTransaction(10000, 1700), {
    uang: 10000, harga: 1700, jumlah: 5, total: 8500, kembalian: 1500, kurang: 0
  });
});
test('calculates shortfall when buyer cannot afford one egg', () => {
  assert.deepEqual(calculateEggTransaction(1000, 1700), {
    uang: 1000, harga: 1700, jumlah: 0, total: 0, kembalian: 1000, kurang: 700
  });
});
test('rejects invalid, fractional and extreme amounts', () => {
  assert.throws(() => calculateEggTransaction(0, 1700), /angka positif/);
  assert.throws(() => calculateEggTransaction(10000.5, 1700), /bilangan bulat/);
  assert.throws(() => calculateEggTransaction(2_000_000_000, 1700), /batas aman/);
});

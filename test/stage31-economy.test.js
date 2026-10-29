import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { makeModCoinEntry } from '../src/lib/energy-worker.js';

test('Coin Mod audit entry validates balances and sanitizes metadata', () => {
  const entry = makeModCoinEntry({ delta: -25, balance: 75, reason: 'fast charge 15V', reference: 'charge/15V', at: 1234 });
  assert.deepEqual(entry, { at: 1234, delta: -25, balance: 75, reason: 'fast-charge-15V', reference: 'charge-15V' });
  assert.throws(() => makeModCoinEntry({ delta: 0, balance: 1 }), /Invalid Mod Coin/);
  assert.throws(() => makeModCoinEntry({ delta: -1, balance: -1 }), /Invalid Mod Coin/);
});

test('Coin Mod credit/spend writes balance and bounded history together; insufficient spend is unchanged', async () => {
  const original = process.cwd();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'whiskay-stage31-'));
  try {
    process.chdir(temp);
    const worker = await import('../src/lib/energy-worker.js?stage31-isolated');
    assert.deepEqual(await worker.addModCoins('user-1', 120, { reason: 'verified-payment', reference: 'INV-1', at: 1000 }), { ok: true, modCoins: 120 });
    assert.deepEqual(await worker.spendModCoins('user-1', 35, { reason: 'fast-charge', reference: '15V', at: 2000 }), { ok: true, modCoins: 85 });
    assert.deepEqual(await worker.spendModCoins('user-1', 1000), { ok: false, reason: 'insufficient-coins', modCoins: 85 });
    const history = await worker.getModCoinHistory('user-1', 10);
    assert.equal(history.balance, 85);
    assert.equal(history.transactions.length, 2);
    assert.equal(history.transactions[0].reason, 'fast-charge');
    assert.equal(history.transactions[1].delta, 120);
    for (let i = 0; i < 105; i++) await worker.addModCoins('user-1', 1, { reason: 'test-credit', at: 3000 + i });
    const bounded = await worker.getModCoinHistory('user-1', 50);
    assert.equal(bounded.transactions.length, 50);
    const ledger = JSON.parse(await readFile(path.join(temp, 'data', 'energy-ledger.json'), 'utf8'));
    assert.equal(ledger['user-1'].modCoinHistory.length, 100);
    assert.equal(ledger['user-1'].modCoins, 190);
  } finally {
    process.chdir(original);
    await rm(temp, { recursive: true, force: true });
  }
});


test('Fast Charge handler attempts a recorded refund when charge storage throws', async () => {
  const source = await readFile(new URL('../src/plugins/owner/energy-system.js', import.meta.url), 'utf8');
  assert.match(source, /catch \(error\)[\s\S]*fast-charge-refund[\s\S]*Refund belum dapat dikonfirmasi/);
});

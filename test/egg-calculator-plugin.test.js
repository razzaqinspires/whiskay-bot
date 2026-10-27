import test from 'node:test';
import assert from 'node:assert/strict';
import eggCalculator from '../src/plugins/tools/egg-calculator.js';
import eggHelp from '../src/plugins/tools/egg-calculator-help.js';

test('egg calculator opens full select list, manual input and validated website CTA', async () => {
  const old = process.env.EGG_CALCULATOR_URL;
  process.env.EGG_CALCULATOR_URL = 'https://calculator.example.com/';
  let payload;
  try {
    await eggCalculator.execute({ prefix: '.', sendInteractive: async (value) => { payload = value; } });
    assert.equal(payload.buttons[0].name, 'single_select');
    assert.equal(payload.buttons[0].title, 'Pilih Transaksi');
    assert.ok(payload.buttons[0].sections[0].rows.length >= 6);
    assert.equal(payload.buttons[1].name, 'quick_reply');
    assert.match(payload.buttons[1].id, /telur manual/);
    assert.equal(payload.buttons[2].name, 'open_webview');
    assert.equal(payload.buttons[2].url, 'https://calculator.example.com/');
  } finally {
    if (old === undefined) delete process.env.EGG_CALCULATOR_URL;
    else process.env.EGG_CALCULATOR_URL = old;
  }
});

test('egg calculator rejects insecure public URLs', async () => {
  const old = process.env.EGG_CALCULATOR_URL;
  process.env.EGG_CALCULATOR_URL = 'http://calculator.example.com/';
  let message;
  try {
    await eggCalculator.execute({ reply: async (value) => { message = value; } });
    assert.match(message, /HTTPS/);
  } finally {
    if (old === undefined) delete process.env.EGG_CALCULATOR_URL;
    else process.env.EGG_CALCULATOR_URL = old;
  }
});

test('egg calculator help documents the whole-unit and change calculation', async () => {
  let payload;
  await eggHelp.execute({ prefix: '.', sendInteractive: async (value) => { payload = value; } });
  assert.match(payload.body, /angka bulat ke bawah/);
  assert.match(payload.body, /Rp1\.500/);
  assert.equal(payload.buttons[0].id, '.telur');
});

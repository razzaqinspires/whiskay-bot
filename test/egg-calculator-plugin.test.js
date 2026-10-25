import test from 'node:test';
import assert from 'node:assert/strict';
import eggCalculator from '../src/plugins/tools/egg-calculator.js';
import eggHelp from '../src/plugins/tools/egg-calculator-help.js';

test('egg calculator plugin uses compact open_webview serializer contract', async () => {
  const old = process.env.EGG_CALCULATOR_URL;
  process.env.EGG_CALCULATOR_URL = 'https://calculator.example.com/';
  let payload;
  try {
    await eggCalculator.execute({ prefix: '.', sendInteractive: async (value) => { payload = value; } });
    assert.equal(payload.buttons[0].name, 'open_webview');
    assert.equal(payload.buttons[0].url, 'https://calculator.example.com/');
    assert.equal(payload.buttons[0].title, 'Buka Kalkulator');
    assert.equal(payload.buttons[0].merchant_url, undefined, 'serializer should fill native-flow fields');
    assert.equal(payload.buttons[1].name, 'quick_reply');
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

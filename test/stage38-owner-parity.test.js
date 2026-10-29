import test from 'node:test';
import assert from 'node:assert/strict';
import ownerParity, { ownerParityInternals } from '../src/plugins/owner/owner-parity.js';

function makeCtx(overrides = {}) {
  const out = { replies: [], interactive: [], chat: '1234567890@s.whatsapp.net', prefix: '.', args: [], command: '', isOwner: true, isGroup: false, sender: '6281234567890@s.whatsapp.net', sock: {},
    async reply(value) { this.replies.push(String(value)); return value; },
    async sendInteractive(value) { this.interactive.push(value); return value; } };
  return Object.assign(out, overrides);
}

test('Stage 38 plugin declares parity commands and owner protection', () => {
  for (const command of ['listgc','listgroup','join','masuk','leave','keluar','listuser','cekapikey']) assert.ok(ownerParity.command.includes(command));
  assert.equal(ownerParity.owner, true);
  assert.equal(ownerParity.energyMode, 'free');
  assert.equal(ownerParity.energyCost, 0);
});

test('non-owner is rejected before any socket operation', async () => {
  let called = false;
  const ctx = makeCtx({ isOwner: false, command: 'listgc', sock: { async groupFetchAllParticipating() { called = true; return {}; } } });
  await ownerParity.execute(ctx);
  assert.match(ctx.replies[0], /khusus owner/i);
  assert.equal(called, false);
});

test('invite parser accepts WhatsApp invite links and rejects unsafe input', () => {
  assert.equal(ownerParityInternals.parseInvite('https://chat.whatsapp.com/AbCdEfGh123456'), 'AbCdEfGh123456');
  assert.equal(ownerParityInternals.parseInvite('chat.whatsapp.com/AbCdEfGh123456'), 'AbCdEfGh123456');
  assert.equal(ownerParityInternals.parseInvite('https://example.com/AbCdEfGh123456'), '');
  assert.equal(ownerParityInternals.parseInvite('short'), '');
});

test('registered user normalization filters malformed identifiers and deduplicates', () => {
  const users = ownerParityInternals.normalizeUsers([
    '6281234567890@s.whatsapp.net',
    { jid: '6281234567890@s.whatsapp.net', name: 'duplicate' },
    { jid: '998877@lid', name: 'LID user' },
    { jid: 'not-a-jid', name: 'bad' },
    { id: '6281111111111@s.whatsapp.net', pushName: 'User Two' }
  ]);
  assert.equal(users.length, 3);
  assert.deepEqual(users.map(x => x.jid).sort(), ['6281111111111@s.whatsapp.net','6281234567890@s.whatsapp.net','998877@lid'].sort());
});

test('listgc paginates sorted group list and omits participant details', async () => {
  const ctx = makeCtx({ command: 'listgc', args: ['1'], sock: { async groupFetchAllParticipating() { return {
    '10000000001-100@g.us': { subject: 'Zulu', participants: [{ id: 'private1' }, { id: 'private2' }] },
    '10000000002-100@g.us': { subject: 'Alpha', participants: [{ id: 'private3' }] }
  }; } } });
  await ownerParity.execute(ctx);
  assert.equal(ctx.interactive.length, 1);
  assert.match(ctx.interactive[0].body, /Alpha/);
  assert.ok(ctx.interactive[0].body.indexOf('Alpha') < ctx.interactive[0].body.indexOf('Zulu'));
  assert.doesNotMatch(ctx.interactive[0].body, /private1|private2|private3/);
});

test('join accepts a valid invite code and reports the returned group id', async () => {
  let receivedCode = '';
  const ctx = makeCtx({ command: 'join', args: ['https://chat.whatsapp.com/AbCdEfGh123456'], sock: { async groupAcceptInvite(code) { receivedCode = code; return '12345678901-123456@g.us'; } } });
  await ownerParity.execute(ctx);
  assert.equal(receivedCode, 'AbCdEfGh123456');
  assert.match(ctx.replies[0], /12345678901-123456@g\.us/);
});

test('join refuses malformed invite before calling Baileys', async () => {
  let called = false;
  const ctx = makeCtx({ command: 'join', args: ['https://example.com/not-a-wa-invite'], sock: { async groupAcceptInvite() { called = true; } } });
  await ownerParity.execute(ctx);
  assert.match(ctx.replies[0], /Format:/);
  assert.equal(called, false);
});

test('leave requires explicit confirmation and group context', async () => {
  let left = false;
  const sock = { async groupLeave() { left = true; } };
  const dm = makeCtx({ command: 'leave', sock });
  await ownerParity.execute(dm);
  assert.match(dm.replies[0], /konfirmasi eksplisit/i);
  assert.equal(left, false);
  const group = makeCtx({ command: 'leave', args: ['confirm'], isGroup: true, chat: '12345678901-123456@g.us', sock });
  await ownerParity.execute(group);
  assert.equal(left, true);
  assert.match(group.replies[0], /Bot akan keluar/);
});

test('API key checker reports configured state but never prints secret contents', async () => {
  const original = process.env.OPENAI_API_KEY;
  const secret = 'stage38-secret-that-must-not-leak';
  process.env.OPENAI_API_KEY = secret;
  try {
    const ctx = makeCtx({ command: 'cekapikey' });
    await ownerParity.execute(ctx);
    const body = ctx.interactive[0].body;
    assert.match(body, /OPENAI_API_KEY: terkonfigurasi/);
    assert.doesNotMatch(body, new RegExp(secret));
  } finally {
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
  }
});

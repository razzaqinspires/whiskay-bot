import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MessageRepository } from '../src/services/message-repository/MessageRepository.js';

const key = (overrides = {}) => ({
  remoteJid: '120363000000000000@g.us',
  id: 'MSG-STAGE70-001',
  fromMe: false,
  participant: '628123456789@s.whatsapp.net',
  ...overrides,
});

test('message repository persists messages and restores after a fresh instance', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-message-repo-'));
  const file = path.join(dir, 'messages.json');
  try {
    const first = new MessageRepository({ file });
    await first.init();
    const original = {
      key: key(),
      messageTimestamp: 1794287012,
      message: { conversation: 'persist me', messageContextInfo: { messageSecret: new Uint8Array([1, 2, 3, 254]) } },
    };
    assert.equal(first.remember(original), true);
    await first.flush();

    const second = new MessageRepository({ file });
    await second.init();
    const restored = await second.get(original.key);
    assert.equal(restored.message.conversation, 'persist me');
    assert.deepEqual([...restored.message.messageContextInfo.messageSecret], [1, 2, 3, 254]);
    assert.equal(second.stats().restored, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('lookup requires exact remoteJid, id, fromMe and participant identity', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-message-key-'));
  try {
    const repo = new MessageRepository({ file: path.join(dir, 'messages.json') });
    await repo.init();
    const message = { key: key(), message: { conversation: 'private payload' } };
    repo.remember(message);
    await repo.flush();
    assert.equal((await repo.get(key())).message.conversation, 'private payload');
    assert.equal((await repo.get({ id: key().id, remoteJid: key().remoteJid, fromMe: false })).message.conversation, 'private payload');
    assert.equal(await repo.get(key({ remoteJid: 'not-a-jid' })), undefined);
    assert.equal(await repo.get(key({ remoteJid: 'other@g.us' })), undefined);
    assert.equal(await repo.get(key({ id: 'OTHER-ID' })), undefined);
    assert.equal(await repo.get(key({ fromMe: true })), undefined);
    assert.equal(await repo.get(key({ participant: 'invalid@domain.test' })), undefined);
    repo.remember({ key: key({ participant: '628999999999@s.whatsapp.net' }), message: { conversation: 'second participant' } });
    await repo.flush();
    assert.equal(await repo.get({ id: key().id, remoteJid: key().remoteJid, fromMe: false }), undefined);
    assert.equal((await repo.get(key())).message.conversation, 'private payload');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('binary fields and messageSecret survive JSON persistence', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-message-binary-'));
  try {
    const file = path.join(dir, 'messages.json');
    const repo = new MessageRepository({ file });
    await repo.init();
    const message = {
      key: key({ id: 'BINARY-001' }),
      message: { extendedTextMessage: { text: 'secret', contextInfo: { messageSecret: Buffer.from([0, 5, 10, 255]) } } },
    };
    repo.remember(message);
    await repo.flush();
    const data = JSON.parse(await readFile(file, 'utf8'));
    assert.ok(JSON.stringify(data).includes('__whiskayBinary'));
    const restored = await repo.get(message.key);
    assert.deepEqual([...restored.message.extendedTextMessage.contextInfo.messageSecret], [0, 5, 10, 255]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('invalid keys and payloads are rejected without creating ambiguous entries', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-message-invalid-'));
  try {
    const repo = new MessageRepository({ file: path.join(dir, 'messages.json') });
    await repo.init();
    assert.equal(repo.remember({ key: { id: 'NO-REMOTE', fromMe: false }, message: { conversation: 'x' } }), false);
    assert.equal(repo.remember({ key: key({ id: '' }), message: { conversation: 'x' } }), false);
    assert.equal(repo.remember({ key: key(), message: null }), false);
    assert.equal(repo.stats().rejected, 3);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('TTL and max-entry bounds prune old records', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-message-bounds-'));
  let now = 1000000;
  try {
    const repo = new MessageRepository({ file: path.join(dir, 'messages.json'), maxEntries: 100, ttlMs: 60000, now: () => now });
    await repo.init();
    repo.remember({ key: key({ id: 'OLD-001' }), message: { conversation: 'old' } });
    await repo.flush();
    now += 61000;
    assert.equal(await repo.get(key({ id: 'OLD-001' })), undefined);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test('corrupt repository fails closed instead of initializing an empty store', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-message-corrupt-'));
  try {
    const file = path.join(dir, 'messages.json');
    await (await import('node:fs/promises')).writeFile(file, '{"version":1,"entries":"broken"}');
    const repo = new MessageRepository({ file });
    await assert.rejects(() => repo.init(), error => error.code === 'WHISKAY_MESSAGE_REPOSITORY_CORRUPT');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

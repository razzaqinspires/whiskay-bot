import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getGroupSettings, updateGroupSettings } from '../src/lib/group-settings.js';
import { applyGroupGuard, sendGroupParticipantNotice } from '../src/lib/group-guard.js';
import groupTools from '../src/plugins/general/group-tools.js';

const GROUP = '120363000000000000@g.us';
const USER = '628123456789@s.whatsapp.net';
const BOT = '628000000000@s.whatsapp.net';

async function withSettingsFile(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-group-test-'));
  const previous = process.env.WHISKAY_GROUP_SETTINGS_FILE;
  process.env.WHISKAY_GROUP_SETTINGS_FILE = path.join(dir, 'settings.json');
  try { await fn(); }
  finally {
    if (previous === undefined) delete process.env.WHISKAY_GROUP_SETTINGS_FILE;
    else process.env.WHISKAY_GROUP_SETTINGS_FILE = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

test('group settings default to safe disabled state and persist per group', async () => {
  await withSettingsFile(async () => {
    const defaults = await getGroupSettings(GROUP);
    assert.equal(defaults.antilink, false);
    assert.equal(defaults.antispam, false);
    assert.equal(defaults.welcome, false);
    const saved = await updateGroupSettings(GROUP, { antilink: true, welcome: true, welcomeText: 'Halo {user} di {group}' });
    assert.equal(saved.antilink, true);
    assert.equal((await getGroupSettings(GROUP)).welcomeText, 'Halo {user} di {group}');
    assert.equal((await getGroupSettings('120363000000000001@g.us')).antilink, false);
  });
});

test('group settings reject invalid group identifiers and ignore unsupported keys', async () => {
  await withSettingsFile(async () => {
    await assert.rejects(() => getGroupSettings('not-a-group'), /groupId/);
    const saved = await updateGroupSettings(GROUP, { antilink: 1, unexpected: 'unsafe' });
    assert.equal(saved.antilink, true);
    assert.equal(saved.unexpected, undefined);
  });
});

test('anti-link removes a non-admin member link when bot has admin privileges', async () => {
  await withSettingsFile(async () => {
    await updateGroupSettings(GROUP, { antilink: true });
    let deleted = false, warned = false;
    const ctx = {
      isGroup: true, fromMe: false, isBot: false, sender: USER, chat: GROUP,
      body: 'check https://example.com', raw: { key: { id: 'message-1' } },
      sock: {
        user: { id: BOT },
        groupMetadata: async () => ({ participants: [{ id: USER }, { id: BOT, admin: 'admin' }] }),
        sendMessage: async (_jid, payload) => { if (payload.delete?.id === 'message-1') deleted = true; }
      },
      reply: async () => { warned = true; }
    };
    assert.equal(await applyGroupGuard(ctx), true);
    assert.equal(deleted, true);
    assert.equal(warned, true);
  });
});

test('anti-link leaves admin messages alone', async () => {
  await withSettingsFile(async () => {
    await updateGroupSettings(GROUP, { antilink: true });
    const ctx = {
      isGroup: true, fromMe: false, isBot: false, sender: USER, chat: GROUP,
      body: 'https://example.com', raw: { key: { id: 'message-2' } },
      sock: {
        user: { id: BOT },
        groupMetadata: async () => ({ participants: [{ id: USER, admin: 'admin' }, { id: BOT, admin: 'admin' }] }),
        sendMessage: async () => { throw new Error('should not delete admin link'); }
      },
      reply: async () => { throw new Error('should not warn admin'); }
    };
    assert.equal(await applyGroupGuard(ctx), false);
  });
});

test('anti-spam triggers after the configured burst threshold', async () => {
  await withSettingsFile(async () => {
    await updateGroupSettings(GROUP, { antispam: true });
    let deletes = 0, warnings = 0;
    const ctx = {
      isGroup: true, fromMe: false, isBot: false, sender: USER, chat: GROUP,
      body: 'message', key: { id: 'spam-message' },
      sock: {
        user: { id: BOT },
        groupMetadata: async () => ({ participants: [{ id: USER }, { id: BOT, admin: 'admin' }] }),
        sendMessage: async (_jid, payload) => { if (payload.delete?.id === 'spam-message') deletes++; }
      },
      reply: async () => { warnings++; }
    };
    let triggered = false;
    for (let i = 0; i < 7; i++) triggered = await applyGroupGuard(ctx) || triggered;
    assert.equal(triggered, true);
    assert.equal(deletes, 1);
    assert.equal(warnings, 1);
  });
});

test('welcome event sends a safe mention with configured placeholders', async () => {
  await withSettingsFile(async () => {
    await updateGroupSettings(GROUP, { welcome: true, welcomeText: 'Selamat datang {user} di {group}!' });
    let sent;
    await sendGroupParticipantNotice({
      groupMetadata: async () => ({ subject: 'Komunitas' }),
      sendMessage: async (jid, payload) => { sent = { jid, payload }; }
    }, { id: GROUP, action: 'add', participants: [USER] });
    assert.equal(sent.jid, GROUP);
    assert.match(sent.payload.text, /Selamat datang @628123456789 di Komunitas/);
    assert.deepEqual(sent.payload.mentions, [USER]);
  });
});

test('group tools register documented command set', () => {
  for (const command of ['grouphelp','groupinfo','admins','tagall','hidetag','revoke','setsubject','setdesc','closegroup','opengroup','antilink','antispam','welcome','setwelcometext']) {
    assert.ok(groupTools.command.includes(command), `missing ${command}`);
  }
});

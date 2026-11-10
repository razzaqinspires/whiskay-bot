import test from 'node:test';
import assert from 'node:assert/strict';
import plugin from '../src/plugins/owner/owner-parity.js';
import { groupMetadataStore } from '../src/services/groupMetadataStore.js';

const source = '120363000000000001@g.us';
const target = '120363000000000002@g.us';
function context(overrides = {}) {
  const calls = { replies: [], interactive: [] };
  return {
    calls, isOwner: true, isGroup: false, chat: '628123456789@s.whatsapp.net', sender: '628123456789@s.whatsapp.net',
    command: 'copymember', args: [source], prefix: '.', sock: { groupInviteCode: async () => 'AbCdEfGhIjKlMnOpQr' },
    reply: async message => calls.replies.push(message),
    sendInteractive: async payload => calls.interactive.push(payload),
    ...overrides
  };
}

test('Stage 49 Part 2: copy member command provides cached preview and blocks silent bulk copying', async () => {
  groupMetadataStore.upsert({ id: source, subject: 'Sumber QA', participants: [{ id: '628111111111@s.whatsapp.net' }, { id: '628222222222@s.whatsapp.net', admin: 'admin' }] });
  const ctx = context();
  await plugin.execute(ctx);
  assert.equal(ctx.calls.interactive.length, 1);
  assert.match(ctx.calls.interactive[0].body, /tidak menyalin daftar kontak/i);
  assert.match(ctx.calls.interactive[0].body, /persetujuan/i);
  assert.equal(ctx.calls.interactive[0].buttons[0].id, `.listgc detail ${source}`);
});

test('Stage 49 Part 2: group invite link is owner-only, private-chat-only, and targets cached group', async () => {
  groupMetadataStore.upsert({ id: target, subject: 'Tujuan QA', participants: [{ id: '628333333333@s.whatsapp.net' }] });
  const ctx = context({ command: 'groupinvite', args: [target] });
  await plugin.execute(ctx);
  assert.match(ctx.calls.replies[0], /https:\/\/chat\.whatsapp\.com\/AbCdEfGhIjKlMnOpQr/);
  const groupCtx = context({ command: 'groupinvite', args: [target], isGroup: true });
  await plugin.execute(groupCtx);
  assert.match(groupCtx.calls.replies[0], /chat pribadi/i);
  assert.equal(groupCtx.sock.groupInviteCode ? 1 : 0, 1);
});

test('Stage 49 Part 2: rejects non-owner and malformed group IDs', async () => {
  const denied = context({ isOwner: false });
  await plugin.execute(denied);
  assert.match(denied.calls.replies[0], /khusus owner/i);
  const malformed = context({ args: ['not-a-group'] });
  await plugin.execute(malformed);
  assert.match(malformed.calls.replies[0], /Format:/);
});

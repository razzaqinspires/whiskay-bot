import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMp4FormatArgs, sendDownloadedMedia } from '../src/plugins/tools/youtube.js';

test('MP4 format selector supports separate streams and generic fallback', () => {
  const args = buildMp4FormatArgs();
  assert.equal(args[0], '-f');
  assert.match(args[1], /bv\*\[height<=720\]\+ba/);
  assert.match(args[1], /\/b\[height<=720\]\/b$/);
  assert.deepEqual(args.slice(-2), ['--merge-output-format', 'mp4']);
});

test('downloaded media uses Baileys sock.sendMessage and quotes original command', async () => {
  let sent;
  const ctx = { chat: '123@s.whatsapp.net', raw: { key: { id: 'msg-1' } }, sock: { sendMessage: async (...args) => { sent = args; return { key: { id: 'out-1' } }; } } };
  const buffer = Buffer.from('audio');
  await sendDownloadedMedia(ctx, 'mp3', buffer, 'caption');
  assert.equal(sent[0], ctx.chat);
  assert.equal(sent[1].audio, buffer);
  assert.equal(sent[1].mimetype, 'audio/mpeg');
  assert.equal(sent[2].quoted, ctx.raw);
});

test('downloaded media reports missing WhatsApp socket clearly', async () => {
  await assert.rejects(() => sendDownloadedMedia({ chat: '123@s.whatsapp.net' }, 'mp4', Buffer.from('x'), ''), /sock\.sendMessage/);
});

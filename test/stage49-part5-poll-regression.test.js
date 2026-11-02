import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('serializer refuses encrypted poll upserts and only accepts decrypted selectedOptions', async () => {
  const source = await read('src/core/serializer.js');
  assert.match(source, /Array\.isArray\(update\?\.vote\?\.selectedOptions\)/);
  assert.match(source, /encPayload\/encIv must be decrypted by Baileys/);
  assert.match(source, /pollUpdateMessageKey, vote: update\.vote/);
});

test('outgoing poll creation is retained for Baileys getMessage decryption', async () => {
  const bot = await read('src/core/Bot.js');
  const serializer = await read('src/core/serializer.js');
  const quiz = await read('src/plugins/games/classic-quiz.js');
  assert.match(bot, /getMessage:\s*async key =>/);
  assert.match(bot, /getStoredMessage\?\.\(key\?\.id, key\?\.remoteJid\)/);
  assert.match(serializer, /compat\.storeMessage\(message\)/);
  assert.match(quiz, /rememberPollCreationMessage\(await .*sendMessage\(.*poll:/s);
});

test('poll aggregation uses Baileys decrypted pollUpdates and full creation WAMessage', async () => {
  const quiz = await read('src/plugins/games/classic-quiz.js');
  assert.match(quiz, /getAggregateVotesInPollMessage\(\{\s*message:\s*state\.pollCreationMessage,\s*pollUpdates:/);
  assert.match(quiz, /state\.pollUpdates = mergePollUpdates/);
});

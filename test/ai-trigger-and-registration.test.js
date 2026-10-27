import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('message handler distinguishes prefixed commands from passive AI and requires registration', async () => {
  const source = await readFile(new URL('../src/handlers/message.js', import.meta.url), 'utf8');
  assert.match(source, /const isCommand = \/\^\[.,!\/#\]\//);
  assert.match(source, /getUser\(ctx\.sender\)/);
  assert.match(source, /relayAnonymousMessage/);
  assert.match(source, /AI_CHAT_MODE/);
});
test('central command handler gates unregistered users without modifying every plugin', async () => {
  const source = await readFile(new URL('../src/core/CommandHandler.js', import.meta.url), 'utf8');
  assert.match(source, /REQUIRE_USER_REGISTRATION/);
  assert.match(source, /allowBeforeRegistration/);
});

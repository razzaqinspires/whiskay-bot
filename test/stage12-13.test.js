import test from 'node:test';
import assert from 'node:assert/strict';
import sticker from '../src/plugins/tools/sticker-maker.js';
import ai from '../src/plugins/tools/ai-chat.js';

test('sticker maker is registered with both aliases', () => { assert.deepEqual(sticker.command, ['s', 'sticker']); assert.equal(typeof sticker.execute, 'function'); });
test('AI chat is registered with both aliases', () => { assert.deepEqual(ai.command, ['ask', 'ai']); assert.equal(typeof ai.execute, 'function'); });
test('sticker and AI plugins declare cooldowns', () => { assert.ok(sticker.cooldown >= 1000); assert.ok(ai.cooldown >= 1000); });

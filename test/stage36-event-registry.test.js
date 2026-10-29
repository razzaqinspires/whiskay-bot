import test from 'node:test';
import assert from 'node:assert/strict';
import { EventRegistry, validateEventInput } from '../src/core/event-registry.js';
import { normalizeUrl, normalizeMention, summarizeMedia } from '../src/core/helper-feature-adapter.js';

test('registry registers aliases and dispatches handler', async () => { const r = new EventRegistry(); r.register({ cmd: ['hello','hi'], energy: 2 }, async ctx => ctx.command); assert.equal((await r.emit('hello')).result, 'hello'); assert.equal(r.has('hi'), true); });
test('registry rejects duplicate aliases and limits recursive dispatch', async () => { const r = new EventRegistry(); r.register({cmd:'loop'}, ctx => ctx.emitEvent('loop')); const result = await r.emit('loop', {}, {maxDepth:2}); assert.equal(result.ok, true); assert.equal(result.result.ok, true); assert.equal(result.result.result.reason, 'depth_limit'); assert.throws(() => r.register({cmd:'loop'},()=>{}), /already registered/); });
test('event guards validate args, premium, quote and mention', () => { assert.equal(validateEventInput({args:true}, {}).reason, 'args_required'); assert.equal(validateEventInput({premium:true}, {}).reason, 'premium_required'); assert.equal(validateEventInput({isQuoted:true}, {}).reason, 'quote_required'); assert.equal(validateEventInput({isMention:true}, {}).reason, 'mention_required'); });
test('URL guard requires exact host boundary and HTTPS/HTTP', () => { assert.equal(normalizeUrl('https://pin.it/abc',['pin.it']), 'https://pin.it/abc'); assert.equal(normalizeUrl('https://pin.it.attacker.test/abc',['pin.it']), null); assert.equal(normalizeUrl('javascript:alert(1)'), null); });
test('normalizers handle mention and media metadata', () => { assert.equal(normalizeMention('@628123456789'), '628123456789@s.whatsapp.net'); assert.equal(normalizeMention('abc'), null); assert.deepEqual(summarizeMedia({mimetype:'audio/ogg; codecs=opus', seconds:12, fileLength:100}), {type:'audio/ogg',seconds:12,size:100,hasBuffer:false}); });

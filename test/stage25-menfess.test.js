import test from 'node:test';
import assert from 'node:assert/strict';
import { createMenfessSession, recordMenfessMessage, resolveMenfessReply, endMenfessSession } from '../src/services/menfessEngine.js';

test('Menfess binds quoted stanza id and routes only to a participant', () => {
  const a = `628${Date.now().toString().slice(-9)}@s.whatsapp.net`;
  const b = `628${(Date.now()+1).toString().slice(-9)}@s.whatsapp.net`;
  const s = createMenfessSession({ sender: a, target: b.split('@')[0], text: 'hello' });
  assert.equal(recordMenfessMessage(s.id, `msg-${s.id}`), true);
  assert.equal(resolveMenfessReply(`msg-${s.id}`, b)?.recipient, a);
  assert.equal(resolveMenfessReply(`msg-${s.id}`, '6280000000000@s.whatsapp.net'), null);
  assert.ok(endMenfessSession(s.id, a));
  assert.equal(resolveMenfessReply(`msg-${s.id}`, b), null);
});

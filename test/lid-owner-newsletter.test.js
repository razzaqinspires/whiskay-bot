import test from 'node:test';
import assert from 'node:assert/strict';
import { isOwner, sameUser } from '../src/lib/security.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const cfg = { owners: ['628123456789@s.whatsapp.net'], ownerLids: ['1234567890123@lid'] };
test('owner PN is matched using PN alias, not the LID digits', () => {
  assert.equal(isOwner(['628123456789@s.whatsapp.net'], cfg), true);
  assert.equal(isOwner(['999@s.whatsapp.net'], cfg), false);
  assert.equal(isOwner(['628123456789@lid'], cfg), false);
});
test('sameUser never equates LID and PN namespaces', () => {
  assert.equal(sameUser('1234567890123@lid', '1234567890123@s.whatsapp.net'), false);
  assert.equal(sameUser('628123456789@s.whatsapp.net', '628123456789'), true);
});
test('serializer adapter reads PN variants and exposes owner state', async () => {
  const src = await readFile(new URL('../src/core/serializer.js', import.meta.url), 'utf8');
  assert.match(src, /remoteJidPn/);
  assert.match(src, /participantPn/);
  assert.match(src, /remoteJidAlt/);
  assert.match(src, /participantAlt/);
  assert.match(src, /ctx\.isOwner\s*=\s*ownerCheck/);
});
test('newsletter plugin is owner-only and uses newsletter JID suffix', async () => {
  const src = await readFile(new URL('../src/plugins/owner/newsletter.js', import.meta.url), 'utf8');
  assert.match(src, /owner:\s*true/);
  assert.match(src, /@newsletter/);
  assert.match(src, /newsletterCreate/);
  assert.match(src, /newsletterMetadata/);
  assert.match(src, /sendMessage\(jid, \{ text: message \}\)/);
});

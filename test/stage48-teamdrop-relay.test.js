import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('Whiskay Bot exposes a separate authenticated TEAMDROP document endpoint', async () => {
  const source = await read('src/index.js');
  assert.match(source, /TEAMDROP_WEBHOOK_SECRET/);
  assert.match(source, /POST' && req\.url === '\/webhooks\/teamdrop\/document'/);
  assert.match(source, /safeSecretMatch\(supplied, teamdropWebhookSecret\)/);
  assert.match(source, /TEAMDROP_MAX_FILE_MB/);
  assert.match(source, /TEAMDROP_WEBHOOK_RATE_LIMIT/);
  assert.match(source, /wasEventSeen\(`teamdrop:\$\{eventId\}`\)/);
  assert.match(source, /markEventSeen\(`teamdrop:\$\{eventId\}`\)/);
  assert.match(source, /sock\.sendMessage\(targetJid, \{/);
  assert.match(source, /document,/);
  assert.match(source, /fileName: filename/);
});

test('TEAMDROP relay credentials are represented as secret restart-required settings', async () => {
  const settings = await read('src/config/settings.js');
  const env = await read('.env.example');
  assert.match(settings, /TEAMDROP_WEBHOOK_SECRET/);
  assert.match(settings, /define\('website', 'TEAMDROP_WHATSAPP_TO', \{ secret: true \}\)/);
  assert.match(env, /^TEAMDROP_WEBHOOK_SECRET=$/m);
  assert.match(env, /^TEAMDROP_WHATSAPP_TO=$/m);
  assert.match(env, /^TEAMDROP_MAX_FILE_MB=50$/m);
});

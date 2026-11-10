import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { updateEnvFileValues } from '../src/lib/env-file.js';

test('TryCloudflare environment updates are atomic, merged, and serialized across concurrent workers', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-env-'));
  const file = path.join(dir, '.env');
  try {
    await updateEnvFileValues(file, { KEEP_ME: 'original', WHISKAY_BOT_WEBHOOK_URL: 'https://old.trycloudflare.com/webhooks/world-boss' });
    await Promise.all([
      updateEnvFileValues(file, { WHISKAY_BOT_WEBHOOK_URL: 'https://new.trycloudflare.com/webhooks/world-boss', WHISKAY_BOT_WEBHOOK_PUBLIC_URL: 'https://new.trycloudflare.com' }),
      updateEnvFileValues(file, { JADIBOT_LAST_TRYCLOUDFLARE_URL: 'https://portal.trycloudflare.com' })
    ]);
    const text = await readFile(file, 'utf8');
    assert.match(text, /^KEEP_ME="original"$/m);
    assert.match(text, /^WHISKAY_BOT_WEBHOOK_URL="https:\/\/new\.trycloudflare\.com\/webhooks\/world-boss"$/m);
    assert.match(text, /^WHISKAY_BOT_WEBHOOK_PUBLIC_URL="https:\/\/new\.trycloudflare\.com"$/m);
    assert.match(text, /^JADIBOT_LAST_TRYCLOUDFLARE_URL="https:\/\/portal\.trycloudflare\.com"$/m);
    assert.equal((text.match(/^WHISKAY_BOT_WEBHOOK_URL=/gm) || []).length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('runtime tunnel code persists the configured ENV_FILE and keeps GitHub URL sync opt-in', async () => {
  const { readFile } = await import('node:fs/promises');
  const tunnel = await readFile(new URL('../src/services/worldBossTunnel.js', import.meta.url), 'utf8');
  const portal = await readFile(new URL('../src/services/jadibotPortal.js', import.meta.url), 'utf8');
  assert.match(tunnel, /process\.env\.ENV_FILE[\s\S]*WHISKAY_BOT_WEBHOOK_URL/);
  assert.match(tunnel, /WHISKAY_TUNNEL_GITHUB_SYNC \|\| 'false'/);
  assert.match(tunnel, /URL TryCloudflare tersimpan otomatis/);
  assert.match(portal, /JADIBOT_LAST_TRYCLOUDFLARE_URL/);
  assert.match(portal, /updateEnvFileValues/);
});

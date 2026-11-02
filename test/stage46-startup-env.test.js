import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ENV_GROUPS, ENV_SETTING_MAP } from '../src/config/settings.js';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('npm start routes through a single-process diagnostic bootstrap', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const boot = await read('scripts/start.mjs');
  const daemon = await read('scripts/daemon.mjs');
  assert.equal(pkg.scripts.start, 'node scripts/daemon.mjs start');
  for (const script of ['stop', 'restart', 'status', 'logs', 'start:foreground']) assert.ok(pkg.scripts[script], `missing npm script ${script}`);
  assert.match(daemon, /detached: true/);
  assert.match(daemon, /runPreflight\('architecture', 'uname', \['-m'\]\)/);
  assert.match(daemon, /spawnSync\('which', \['cloudflared'\]/);
  assert.match(daemon, /not installed; optional/);
  assert.match(daemon, /Cloudflared executable/);
  assert.match(daemon, /bin\/cloudflared-linux-arm64.*data\/bin\/cloudflared-linux-arm64/);
  assert.match(daemon, /whiskay-bot\.pid/);
  assert.match(daemon, /whiskay-bot\.launch\.lock/);
  assert.match(daemon, /findLegacyBotProcess/);
  assert.match(boot, /findLegacyBotProcess/);
  assert.match(daemon, /process\.kill\(current\.pid, 'SIGTERM'\)/);
  assert.match(boot, /uname', \['-m'\]/);
  assert.match(boot, /which', \['cloudflared'\]/);
  assert.match(boot, /bin\/cloudflared-linux-arm64.*data\/bin\/cloudflared-linux-arm64/);
  assert.match(boot, /not installed \(optional\)/);
  assert.match(boot, /await import\(pathToFileURL/);
  assert.match(boot, /openSync\(lockPath, 'wx'/);
  assert.match(boot, /\.runtime', 'whiskay-bot\.pid/);
});

test('package metadata identifies Arifi Razzaq and the canonical GitHub repository', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.author, 'Arifi Razzaq');
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.equal(pkg.repository.url, 'https://github.com/razzaqinspires/whiskay-bot.git');
  assert.equal(pkg.license, 'MIT');
});

test('owner configuration is whitelisted, grouped and secrets are marked', () => {
  assert.ok(ENV_GROUPS.length >= 7);
  assert.equal(ENV_SETTING_MAP.get('OWNER_NAME').hotReloadable, true);
  assert.equal(ENV_SETTING_MAP.get('OPENAI_API_KEY').secret, true);
  assert.equal(ENV_SETTING_MAP.get('WHISKAY_GITHUB_SYNC_TOKEN').secret, true);
  assert.equal(ENV_SETTING_MAP.get('WHISKAY_BOT_WEBHOOK_PORT').hotReloadable, false);
  assert.equal(ENV_SETTING_MAP.get('WHISKAY_BOSS_WEBHOOK_SECRET').hotReloadable, false);
  assert.equal(ENV_SETTING_MAP.get('TEAMDROP_WEBHOOK_SECRET').secret, true);
  assert.equal(ENV_SETTING_MAP.get('TEAMDROP_WEBHOOK_SECRET').hotReloadable, false);
  assert.equal(ENV_SETTING_MAP.get('WHISKAY_WEBHOOK_TUNNEL_ENABLED').hotReloadable, false);
  assert.equal(ENV_SETTING_MAP.get('MEDIA_DOWNLOADER_API_URLS').secret, true);
  assert.deepEqual(ENV_SETTING_MAP.get('JADIBOT_TUNNEL').enum, ['auto', 'on', 'off']);
  assert.equal(ENV_SETTING_MAP.get('WHISKAY_RPG_PROJECT_DIR').hotReloadable, false);
});

test('environment template documents owner, runtime, provider and integration values without credentials', async () => {
  const env = await read('.env.example');
  for (const key of ['OWNER_NAME=Arifi Razzaq','OWNERS=','OPENAI_API_KEY=','GEMINI_API_KEY=','CLOUDFLARED_BIN=','WHISKAY_GITHUB_REPO=razzaqinspires/whiskay-bot','WHISKAY_BOT_WEBHOOK_PORT=8787','TEAMDROP_WEBHOOK_SECRET=','TEAMDROP_WHATSAPP_TO=','ENV_RELOAD_ENABLED=true','DUNGEON_WEBSITE_URL=https://whiskay-rpg-companion.vercel.app','JADIBOT_TUNNEL=auto','MEDIA_DOWNLOADER_API_URL=','MEDIA_DOWNLOADER_API_URLS=']) assert.ok(env.includes(key), `missing ${key}`);
  assert.doesNotMatch(env, /(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})/);
  for (const key of ENV_SETTING_MAP.keys()) assert.match(env, new RegExp(`^${key}=`, 'm'), `template missing schema key ${key}`);
});

test('Cloudflared spawn errors clear the cached child so retries can recover', async () => {
  const source = await read('src/services/worldBossTunnel.js');
  assert.match(source, /if \(child === currentChild\) child = null/);
  assert.match(source, /if \(!stopping\) scheduleRetry\(\)/);
});

test('config categories paginate every key instead of silently hiding settings after ten', async () => {
  const plugin = await read('src/plugins/owner/config-manager.js');
  assert.match(plugin, /const pageSize = 10/);
  assert.match(plugin, /Berikutnya/);
  assert.match(plugin, /Sebelumnya/);
  assert.match(plugin, /safePage \* pageSize/);
});

test('GitHub command has separate analysis, QA, and explicit owner confirmation steps', async () => {
  const plugin = await read('src/plugins/owner/github-push.js');
  assert.match(plugin, /repository analysis/i);
  assert.match(plugin, /Jalankan QA/);
  assert.match(plugin, /Commit & Push/);
  assert.match(plugin, /row\.sender !== String/);
  assert.match(plugin, /row\.chat !== String/);
  assert.match(plugin, /approval\.qaPassed/);
});

test('owner contact uses OWNER_NAME from environment for the vCard display identity', async () => {
  const source = await read('src/plugins/general/owner-contact.js');
  assert.match(source, /process\.env\.OWNER_NAME/);
  assert.match(source, /FN:\$\{ownerName\}/);
  assert.match(source, /displayName: ownerName/);
});

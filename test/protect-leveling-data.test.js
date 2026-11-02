import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const protectScript = path.join(projectRoot, 'scripts', 'protect-runtime-data.mjs');

test('protect-runtime-data untracks ALL data/ and sessions files while preserving local bytes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-protect-runtime-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Whiskay Test'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'whiskay-test@example.invalid'], { cwd: root });
    const files = [
      ['data/leveling.json', '{"users":{}}'],
      ['data/app-database.json', '{"privateUsers":[]}'],
      ['data/dungeon/floors.json', '[{"floor":1}]'],
      ['data/jadibot/sessions/auth.json', '{"creds":"local"}'],
      ['sessions/creds.json', '{"session":"local"}'],
      ['session/auth.json', '{"session":"local"}'],
      ['.wwebjs_auth/default/creds.json', '{"session":"local"}'],
      ['baileys_auth_info/creds.json', '{"session":"local"}'],
      ['cache.sqlite-wal', 'private database sidecar'],
      ['credentials.json', '{"privateKey":"local"}'],
      ['.env', 'WHATSAPP_SESSION=local-only'],
      ['.env.example', 'API_KEY=replace-me'],
      ['assets/dungeon/floors.json', '[{"floor":1}]'],
    ];
    for (const [relative, content] of files) {
      const target = path.join(root, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, `${content}\n`);
    }
    await mkdir(path.join(root, 'scripts'), { recursive: true });
    await copyFile(protectScript, path.join(root, 'scripts', 'protect-runtime-data.mjs'));
    execFileSync('git', ['add', '-f', ...files.map(([relative]) => relative)], { cwd: root });

    const result = spawnSync(process.execPath, ['scripts/protect-runtime-data.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean).sort();
    assert.deepEqual(tracked, ['.env.example', 'assets/dungeon/floors.json']);
    for (const [relative, content] of files) {
      assert.equal(await readFile(path.join(root, relative), 'utf8'), `${content}\n`, `${relative} must not be deleted locally`);
    }
    assert.match(result.stdout, /byte lokal TIDAK dihapus/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

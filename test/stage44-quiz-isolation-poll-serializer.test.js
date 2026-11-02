import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getQuizSessionKey, getQuizTypes, buildMultipleChoice } from '../src/plugins/games/classic-quiz.js';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('Tebak Gambar and Tebak Anime have isolated sessions per chat and type', () => {
  assert.notEqual(getQuizSessionKey('120@g.us', 'tebakgambar'), getQuizSessionKey('120@g.us', 'tebakanime'));
  assert.equal(getQuizSessionKey('120@g.us', 'tebakgambar'), '120@g.us::tebakgambar');
  assert.ok(getQuizTypes().includes('tebakgambar'));
  assert.ok(getQuizTypes().includes('tebakanime'));
});

test('quiz sessions support simultaneous games and type-specific button actions', async () => {
  const source = await read('src/plugins/games/classic-quiz.js');
  assert.match(source, /sessions\.set\(key, game\)/);
  assert.match(source, /export const getQuizSessionKey = \(chat, type\)/);
  assert.match(source, /findActiveGame\(ctx, requestedType/);
  assert.match(source, /hint \$\{cmd\}/);
  assert.match(source, /nyerah \$\{cmd\}/);
  assert.match(source, /Game lain dapat berjalan bersamaan/);
});

test('every quiz type exposes its own global top-player command', async () => {
  const source = await read('src/plugins/games/classic-quiz.js');
  assert.match(source, /Object\.keys\(GAME_TYPES\)\.map\(type => `top\$\{type\}`\)/);
  assert.match(source, /cmd\.startsWith\('top'\) && GAME_TYPES\[cmd\.slice\(3\)\]/);
  assert.match(source, /getQuizLeaderboard\(type, 10\)/);
});

test('Tebak Gambar and Tebak Anime each produce four distinct single-choice options', () => {
  for (const [type, answer] of [['tebakgambar', 'jam'], ['tebakanime', 'naruto']]) {
    const poll = buildMultipleChoice(type, answer);
    assert.equal(poll.values.length, 4);
    assert.equal(new Set(poll.choices.map(x => x.toLowerCase())).size, 4);
    assert.ok(poll.choices.includes(answer));
  }
});

test('serializer.js normalizes pollUpdateMessage from upserts; compat file is not modified', async () => {
  const serializer = await read('src/core/serializer.js');
  const bot = await read('src/core/Bot.js');
  const compat = await read('src/core/serializer-compat.cjs');
  assert.match(serializer, /extractPollUpdateEvents/);
  assert.match(serializer, /ctx\.isPollUpdate/);
  assert.match(serializer, /ctx\.pollUpdate/);
  assert.match(serializer, /pollCreationMessageKey/);
  assert.match(serializer, /pollUpdates:\s*\[/);
  assert.match(bot, /extractPollUpdateEvents\(upsert\)/);
  assert.match(bot, /handleClassicQuizPollUpdates\(sock, pollEvents\)/);
  assert.match(compat, /Baileys Message Serialization/);
  assert.doesNotMatch(compat, /extractPollUpdateEvents/);
});

test('poll aggregation receives the full poll-creation WAMessage, not only its message payload', async () => {
  const source = await read('src/plugins/games/classic-quiz.js');
  assert.match(source, /pollCreationMessage:\s*sent[,}]/);
  assert.match(source, /getAggregateVotesInPollMessage\(\{\s*message:\s*state\.pollCreationMessage/);
});

test('quiz wins persist per-game global ranking and grant XP to the leveling profile', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'whiskay-stage44-'));
  try {
    const moduleUrl = new URL('../src/lib/leveling.js', import.meta.url).href;
    const script = `process.env.WHISKAY_DATA_DIR=${JSON.stringify(dir)}; const m=await import(${JSON.stringify(moduleUrl)}); const a=await m.awardQuizWin('120@g.us','628123@s.whatsapp.net','tebakgambar',35,5); const b=await m.getQuizLeaderboard('tebakgambar'); const c=await m.getQuizLeaderboard('tebakanime'); if(a.xp!==35||a.coins!==5||b.length!==1||b[0].wins!==1||b[0].xp!==35||c.length!==0) process.exit(3);`;
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const db = JSON.parse(await readFile(path.join(dir, 'leveling.json'), 'utf8'));
    assert.equal(db.quizStats['tebakgambar|628123@s.whatsapp.net'].wins, 1);
    assert.equal(db.users['120@g.us|628123@s.whatsapp.net'].xp, 35);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

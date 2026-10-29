import test from 'node:test';
import assert from 'node:assert/strict';
import community, { FUN_DATA, createTriviaRound, evaluateTrivia } from '../src/plugins/fun/community-fun.js';
import weatherTranslate, { weatherLabel, parseTranslateArgs } from '../src/plugins/tools/weather-translate.js';
import animeSearch from '../src/plugins/tools/anime-search.js';
import ttt, { winner, chooseBotMove } from '../src/plugins/games/tictactoe.js';

test('Stage 33 ports missing fun commands into the ESM Whiskay plugin contract', () => {
  for (const cmd of ['eightball','fact','joke','compliment','flirt','insult','quote','shayari','roseday','trivia']) assert.ok(community.command.includes(cmd), `${cmd} is registered`);
  assert.equal(community.category, 'fun');
  assert.ok(Object.keys(FUN_DATA).length >= 9);
});

test('trivia question offers deterministic answer evaluation and rejects invalid choices', () => {
  const round = createTriviaRound(() => 0);
  assert.equal(round.options[round.answer] !== undefined, true);
  assert.deepEqual(evaluateTrivia(round, round.answer), { valid: true, correct: true, note: round.note });
  assert.equal(evaluateTrivia(round, 99).valid, false);
  assert.equal(evaluateTrivia(round, 'abc').valid, false);
});

test('weather command translates Open-Meteo codes into Indonesian labels', () => {
  assert.equal(weatherLabel(0), 'Cerah');
  assert.equal(weatherLabel(95), 'Badai petir');
  assert.equal(weatherLabel(999), 'Kondisi tidak diketahui');
  assert.ok(weatherTranslate.command.includes('cuaca'));
  assert.ok(!weatherTranslate.command.includes('weather'), 'preserves existing RPG .weather subcommand');
});

test('translation parser only accepts supported language pairs and bounded text', () => {
  assert.deepEqual(parseTranslateArgs(['id','en','Selamat','pagi']), { source:'id', target:'en', text:'Selamat pagi' });
  assert.equal(parseTranslateArgs(['xx','en','hi']), null);
  assert.equal(parseTranslateArgs(['id','en']), null);
  assert.ok(parseTranslateArgs(['id','en', 'x'.repeat(1300)]).text.length <= 1200);
});

test('anime and manga commands use a bounded public catalog query', () => {
  assert.ok(animeSearch.command.includes('anime'));
  assert.ok(animeSearch.command.includes('manga'));
  assert.ok(animeSearch.cooldown >= 5000);
});

test('Tic-Tac-Toe detects winner/draw and blocks the player winning move', () => {
  assert.equal(winner(['X','X','X','O',null,'O',null,null,null]), 'X');
  assert.equal(winner(['X','O','X','X','O','O','O','X','X']), 'draw');
  assert.equal(chooseBotMove(['X','X',null,'O',null,null,null,null,null]), 2);
  assert.equal(chooseBotMove(['O','O',null,'X',null,'X',null,null,null]), 2);
  assert.ok(ttt.command.includes('tictactoe'));
});

test('ported commands contain no copied hard-coded API credentials or view-once extractor', async () => {
  const { readFile } = await import('node:fs/promises');
  const paths = ['../src/plugins/fun/community-fun.js','../src/plugins/tools/weather-translate.js','../src/plugins/tools/anime-search.js','../src/plugins/games/tictactoe.js'];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]{16,}/i);
    assert.doesNotMatch(source, /viewOnceMessageV2.*sendMessage/s);
  }
});

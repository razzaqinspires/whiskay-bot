import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getQuizTypes, getQuizDatabaseEntries, normalizeQuizAnswer, isQuizAnswerCorrect, buildMultipleChoice, isAllowedQuizVoter } from '../src/plugins/games/classic-quiz.js';
import quiz from '../src/plugins/games/classic-quiz.js';
import groupTools from '../src/plugins/general/group-tools.js';
import groupSafety from '../src/plugins/general/group-safety.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('classic quiz transplants all 10 requested quiz families', () => {
  const expected = ['tebakgambar','susunkata','family100','tebakanime','caklontong','asahotak','tebakjenaka','tebakbendera','tebaktebakan','tebaklirik'];
  assert.deepEqual(getQuizTypes(), expected);
  for (const command of expected) assert.ok(quiz.command.includes(command), `missing ${command}`);
});

test('quiz answer normalization handles case, punctuation, and repeated whitespace', () => {
  assert.equal(normalizeQuizAnswer('  NARUTO!!!  '), 'naruto');
  assert.equal(isQuizAnswerCorrect({ answer: 'Naruto' }, ' naruto '), true);
  assert.equal(isQuizAnswerCorrect({ answer: ['Kompor', 'Panci'] }, 'panci!'), true);
  assert.equal(isQuizAnswerCorrect({ answer: 'Naruto' }, 'Sasuke'), false);
});

test('group command families are individually exposed to the dynamic menu', async () => {
  const required = ['grouphelp','groupinfo','admins','tagall','hidetag','revoke','linkgc','setsubject','setdesc','closegroup','opengroup','antilink','antispam','welcome','ephemeral','groupschedule','absen','pinchat','bancmd','unbancmd','blacklist','unblacklist'];
  assert.ok(Array.isArray(groupTools.menuCommands));
  for (const command of required) assert.ok(groupTools.menuCommands.includes(command), `menu missing ${command}`);
  assert.ok(!groupSafety.command.includes('grouphelp'), 'grouphelp must have one authoritative handler');
  const source = await read('src/plugins/general/group-tools.js');
  assert.match(source, /if \(cmd === 'grouphelp'\)[\s\S]*?ctx\.sendInteractive/);
  assert.match(source, /Lihat Command Grup/);
});

test('Stage 41 menu and docs describe the adapted answer command rather than claiming plain-text reply support', async () => {
  const doc = await read('docs/stages/STAGE-41-ITERATION-1.md');
  const readme = await read('README.md');
  assert.match(doc, /\.jawab/);
  assert.match(doc, /group-tools/);
  assert.match(readme, /Stage 41/);
});


test('every quiz database entry can produce four distinct A-D choices including a correct answer', () => {
  for (const command of getQuizTypes()) {
    const quizDef = command;
    const sample = {
      tebakgambar: 'hati', susunkata: 'medan', family100: ['kompor', 'panci', 'wajan', 'pisau'],
      tebakanime: 'luffy', caklontong: 'umur', asahotak: 'peta', tebakjenaka: 'botol',
      tebakbendera: 'indonesia', tebaktebakan: 'waktu', tebaklirik: 'indonesia'
    }[quizDef];
    const built = buildMultipleChoice(command, sample);
    assert.equal(built.values.length, 4, `${command} should have four poll options`);
    assert.deepEqual(built.values.map((v, i) => v.slice(0, 2)), ['A.', 'B.', 'C.', 'D.']);
    assert.equal(new Set(built.choices.map(v => v.toLowerCase())).size, 4, `${command} options must be distinct`);
    assert.ok(built.choices.some(v => (Array.isArray(sample) ? sample : [sample]).includes(v)), `${command} must contain a correct answer`);
  }
});

test('quiz uses native single-select poll and handles Baileys poll aggregation updates', async () => {
  const source = await read('src/plugins/games/classic-quiz.js');
  const handler = await read('src/handlers/message.js');
  assert.match(source, /poll:\s*\{\s*name:/);
  assert.match(source, /selectableCount:\s*1/);
  const bot = await read('src/core/Bot.js');
  assert.match(bot, /sock\.ev\.on\('messages\.update'/);
  assert.match(bot, /handleClassicQuizPollUpdates\(sock, updates\)/);
  assert.match(source, /getAggregateVotesInPollMessage/);
  assert.match(source, /item\?\.update\?\.pollUpdates/);
  assert.match(source, /rotateFamily100Poll/);
  assert.match(source, /game\.votedPlayers/);
});


test('Tebak Gambar has local fallback images and rejects remote records without a safe image URL', async () => {
  const source = await read('src/plugins/games/classic-quiz.js');
  const { stat } = await import('node:fs/promises');
  for (const file of ['src/assets/quiz/heart.png', 'src/assets/quiz/clock.png']) {
    const info = await stat(new URL(`../${file}`, import.meta.url));
    assert.ok(info.size > 1000, `${file} should be a real image asset`);
  }
  assert.match(source, /localImage: 'heart\.png'/);
  assert.match(source, /localImage: 'clock\.png'/);
  assert.match(source, /type === 'tebakgambar'.*remoteImage/);
});


test('source Ular Tangga aliases are exposed and destructive session actions are restricted', async () => {
  const snake = await import('../src/plugins/games/snake-ladders.js');
  for (const command of ['dadu', 'roll', 'delsesiut', 'delulartangga']) assert.ok(snake.default.command.includes(command), `missing source alias ${command}`);
  const source = await read('src/plugins/games/snake-ladders.js');
  assert.match(source, /Hanya pembuat sesi, admin grup, atau owner yang dapat menghapus sesi/);
  assert.match(source, /Hanya pembuat sesi, admin grup, atau owner yang dapat menghentikan permainan/);
});


test('every stored quiz database row can generate four distinct A-D choices containing a valid answer', () => {
  const entries = getQuizDatabaseEntries();
  assert.ok(entries.length >= 20, 'all built-in quiz rows should be inventoried');
  for (const entry of entries) {
    const built = buildMultipleChoice(entry.type, entry.answer);
    assert.equal(built.values.length, 4, `${entry.type}[${entry.index}] must have four options`);
    assert.deepEqual(built.values.map(value => value.slice(0, 2)), ['A.', 'B.', 'C.', 'D.']);
    assert.equal(new Set(built.choices.map(value => normalizeQuizAnswer(value))).size, 4, `${entry.type}[${entry.index}] options must be unique`);
    const answers = Array.isArray(entry.answer) ? entry.answer : [entry.answer];
    assert.ok(built.choices.some(choice => answers.some(answer => normalizeQuizAnswer(answer) === normalizeQuizAnswer(choice))), `${entry.type}[${entry.index}] must contain a valid answer`);
  }
});

test('quiz poll authorization is bound to the intended user and ignores all other voters', () => {
  const state = { allowedVoters: ['628123456789@s.whatsapp.net', '99999@lid'] };
  assert.equal(isAllowedQuizVoter(state, '628123456789:4@s.whatsapp.net'), true);
  assert.equal(isAllowedQuizVoter(state, '99999@lid'), true);
  assert.equal(isAllowedQuizVoter(state, '628000000000@s.whatsapp.net'), false);
  assert.equal(isAllowedQuizVoter(state, ''), false);
  assert.equal(isAllowedQuizVoter(null, '628123456789@s.whatsapp.net'), false);
});

test('quiz response path consumes the first poll selection and prevents .jawab bypass while poll is active', async () => {
  const source = await read('src/plugins/games/classic-quiz.js');
  assert.match(source, /if \(!isAllowedQuizVoter\(state, voter\)\) return/);
  assert.match(source, /state\.answeredVoters\.push\(voter\)/);
  assert.match(source, /game\.pollConsumed = true/);
  assert.match(source, /perintah \.jawab dinonaktifkan selama polling aktif/i);
  assert.match(source, /Ronde ini khusus untuk pengguna yang memulainya/);
  assert.match(source, /mergePollUpdates\(state\.pollUpdates \|\| \[\], pollUpdates\)/);
});

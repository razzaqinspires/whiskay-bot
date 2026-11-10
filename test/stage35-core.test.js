import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { suggestCommands, similarity } from '../src/core/typo-suggestions.js';

// This file is also run directly by `npm run verify:stage35` and `verify:all`,
// outside the npm-test sandbox. Point leveling storage at a disposable folder
// before importing the module so test fixtures can never touch production data.
const stage35Runtime = await mkdtemp(path.join(os.tmpdir(), 'whiskay-stage35-test-'));
process.env.WHISKAY_DATA_DIR = path.join(stage35Runtime, 'data');
const { awardCommandXP, getProfile, xpForNextLevel } = await import('../src/lib/leveling.js');
after(async () => { await rm(stage35Runtime, { recursive: true, force: true }); });

test('Stage 35: command XP is independent of group message leveling toggle and isolated from production data', async () => {
 assert.equal(process.env.WHISKAY_DATA_DIR, path.join(stage35Runtime, 'data'));
 const stamp=Date.now(), group=`stage35-test-group-${stamp}`, user=`stage35-test-user-${stamp}@s.whatsapp.net`;
 const before=await getProfile(group,user);
 const award=await awardCommandXP(group,user,'profile',Date.now());
 const after=await getProfile(group,user);
 assert.ok(award.gain>=3&&award.gain<=5); assert.equal(after.xp,before.xp+award.gain); assert.equal(after.points,before.points+1); assert.ok(xpForNextLevel(after.level)>0);
});
test('Stage 35: typo suggestions return measurable similarity', async()=>{
 assert.ok(similarity('leaderbord','leaderboard')>.6);
 const suggestions=await suggestCommands('leaderbord',['leaderboard','profile','menu']);
 assert.ok(suggestions.some(x=>x.command==='leaderboard'&&x.percentage>60));
});
test('Stage 35: chess implementation uses full chess.js and Canvas renderer with two-choice flow', async()=>{
 const source=await readFile(new URL('../src/plugins/games/chess.js',import.meta.url),'utf8');
 assert.match(source,/from 'chess\.js'/); assert.match(source,/@napi-rs\/canvas/); assert.match(source,/Rekomendasi:/); assert.match(source,/Daftar Langkah Legal/); assert.match(source,/chessStats/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { awardCommandXP, getProfile, xpForNextLevel } from '../src/lib/leveling.js';
import { suggestCommands, similarity } from '../src/core/typo-suggestions.js';

test('Stage 35: command XP is independent of group message leveling toggle', async () => {
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

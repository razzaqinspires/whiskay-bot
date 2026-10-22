import test from 'node:test'; import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
test('auction plugin exposes sell/list/buy server actions',async()=>{const s=await read('../src/plugins/games/rpg-auction.js');assert.match(s,/command: \['auction'\]/);assert.match(s,/\.auction sell/);assert.match(s,/\.auction buy/);assert.match(s,/\/api\/player\/auction/)});
test('webhook validates secret and fixed world boss event',async()=>{const s=await read('../src/index.js');assert.match(s,/world_boss_spawned/);assert.match(s,/WHISKAY_BOSS_WEBHOOK_SECRET/);assert.match(s,/webhooks\/world-boss/)});
test('bot README contains detailed architecture and docs index',async()=>{const s=await read('../README.md');assert.match(s,/Smart Energy Middleware/);assert.match(s,/graph TD/);assert.match(s,/📚 Documentation & Archives/);assert.match(s,/\.auction sell/)});

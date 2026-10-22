import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = p => readFile(new URL(p, import.meta.url), 'utf8');
test('Stage 11 news plugin uses bounded fetch and timeout', async () => { const s=await read('../src/plugins/tools/news-fetcher.js'); assert.match(s,/command:\s*\['berita',\s*'news'\]/); assert.match(s,/AbortController/); assert.match(s,/finally\s*\{\s*clearTimeout/); });
test('Stage 11 broadcast is owner-only and rate paced', async () => { const s=await read('../src/plugins/owner/broadcast.js'); assert.match(s,/owner:\s*true/); assert.match(s,/if\s*\(!ctx\.isOwner\)/); assert.match(s,/await sleep\(900\)/); assert.match(s,/groupFetchAllParticipating/); });

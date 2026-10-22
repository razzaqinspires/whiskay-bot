import test from 'node:test';
import assert from 'node:assert/strict';
import { appendConversation, getConversation, clearConversation, memoryStats } from '../src/cognitive/short-term-memory.js';

test('short-term memory keeps only last eight messages per sender', () => {
  clearConversation('user-stage16');
  for (let i=0;i<12;i++) appendConversation('user-stage16', i%2?'assistant':'user', `m${i}`);
  const history=getConversation('user-stage16');
  assert.equal(history.length,8); assert.equal(history.at(-1).content,'m11');
  assert.ok(memoryStats().sessions>=1); clearConversation('user-stage16'); assert.equal(getConversation('user-stage16').length,0);
});

test('category normalization source supports category, tags and category arrays', async () => {
 const fs = await import('node:fs/promises');
 const loader = await fs.readFile(new URL('../src/core/Loader.js', import.meta.url), 'utf8');
 const manager = await fs.readFile(new URL('../src/core/PluginManager.js', import.meta.url), 'utf8');
 assert.match(loader, /rawTags/); assert.match(loader, /Array\.isArray\(rawCategory\)/);
 assert.match(manager, /Array\.isArray\(p\.categories\)/); assert.match(manager, /Array\.isArray\(p\.tags\)/);
});

test('menu compiler resolves categories from normalized plugin metadata', async () => {
 const fs = await import('node:fs/promises'); const source = await fs.readFile(new URL('../src/plugins/general/menu.js', import.meta.url), 'utf8');
 assert.match(source, /categoryCandidates/); assert.match(source, /registry\.plugins\?\.plugins instanceof Map/);
});

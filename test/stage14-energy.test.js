import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import energyPlugin from '../src/plugins/owner/energy-system.js';
import { complexityScore } from '../src/lib/energy-worker.js';
test('Stage 14 energy and owner utility commands are registered',()=>{for(const cmd of ['charge','hit','setpayment','bukti','status','premium'])assert.ok(energyPlugin.command.includes(cmd));assert.notEqual(energyPlugin.energyMode,'static');});
test('dynamic worker estimate uses bounded inputs and energy range',()=>{assert.ok(complexityScore('a'.repeat(10000))<=8.75);assert.ok(complexityScore('hello')>=0.25);});
test('loader infers menu category from plugin directory',async()=>{const src=await readFile(new URL('../src/core/Loader.js',import.meta.url),'utf8');assert.ok(src.includes('folderCategory'));assert.ok(src.includes('x.category = candidates[0] || folderCategory')); assert.ok(src.includes('rawTags'));});

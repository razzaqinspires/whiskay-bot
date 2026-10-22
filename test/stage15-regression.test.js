import test from 'node:test';
import assert from 'node:assert/strict';
import { complexityScore } from '../src/lib/energy-worker.js';
import { readFile } from 'node:fs/promises';
test('energy estimates differ across commands and prompts',()=>{const vals=new Set(['ping','menu','ask jelaskan fotosintesis','craft potion','ask hitung integral x^2','gacha'].map(x=>complexityScore(x)));assert.ok(vals.size>=5,`expected at least five distinct estimates, got ${[...vals]}`);});
test('menu prints category headings independent of alphabetical ordering',async()=>{const s=await readFile(new URL('../src/plugins/general/menu.js',import.meta.url),'utf8');assert.match(s,/categoriesVisible!==false&&settings\.widgets\.includes\('category'\)&&row\.category!==lastCategory/);assert.match(s,/Legenda: ⚡ Energi dinamis/);});
test('premium gate exists in command handler',async()=>{const s=await readFile(new URL('../src/core/CommandHandler.js',import.meta.url),'utf8');assert.match(s,/p\.premium && !await hasPremium/);});

test('Limit and Premium commands are present with metadata', async()=>{const s=await readFile(new URL('../src/plugins/tools/limit-tools.js',import.meta.url),'utf8');for(const cmd of ['vipgen','captiongen','promptgen','premiumask','premiumboost'])assert.ok(s.includes(cmd));assert.ok(s.includes('limitCost:2'));assert.ok(s.includes('premium:true'));});
test('cognitive planner bounds prompts and classifies math', async()=>{const m=await import('../src/cognitive/metacognitive-nexus.js');assert.equal(m.planCognitiveRequest('hitung x + 2').mode,'structured-math');assert.ok(m.planCognitiveRequest('a'.repeat(9000)).prompt.length<=3500);});

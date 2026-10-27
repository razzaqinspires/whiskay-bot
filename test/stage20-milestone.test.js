import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = relative => readFile(new URL(relative, import.meta.url), 'utf8');

test('serializer runtime export fixes Bot.js named import', async () => {
  const source = await read('../src/core/serializer.js');
  const bot = await read('../src/core/Bot.js');
  assert.match(source, /export const attachSerializerRuntime = compat\.extendSocket/);
  assert.match(bot, /import \{ attachSerializerRuntime \} from '\.\/serializer\.js'/);
});

test('Nexora system prompt is prefilled and below the model input cap', async () => {
  const env = await read('../.env.example');
  const line = env.split(/\r?\n/).find(row => row.startsWith('AI_SYSTEM_PROMPT='));
  assert.ok(line, 'AI_SYSTEM_PROMPT must be present in .env.example');
  assert.ok(line.length - 'AI_SYSTEM_PROMPT='.length - 2 <= 1600, 'prompt should fit ai-chat cleaning limit');
  assert.match(line, /Nexora/);
});

test('Stage 20 companion, image game, and group controls are registered', async () => {
  const pet = await read('../src/plugins/games/pet.js');
  const slot = await read('../src/plugins/games/slot.js');
  const canvas = await read('../src/services/canvas-v2.js');
  const groups = await read('../src/plugins/general/group-tools.js');
  assert.match(pet, /'hatch','feed','mypet','pet'/);
  assert.match(slot, /renderSlotMachineV2/);
  assert.match(canvas, /renderGroupMemberCardV2/);
  assert.match(groups, /'antilink'.*'welcome'/s);
});

test('energy worker avoids overlapping background scans and tracks pending writes', async () => {
  const source = await read('../src/lib/energy-worker.js');
  assert.match(source, /if \(regenTickRunning\) return/);
  assert.match(source, /pendingWriteCount/);
  assert.match(source, /Math\.round\(\(before \+ 0\.01\) \* 100\) \/ 100/);
});

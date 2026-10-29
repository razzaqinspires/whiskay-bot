import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');

let audit;
test('Stage 40 source audit covers all 17 recorded Experimental-Bell families without claiming full parity', async () => {
  audit = JSON.parse(await read('docs/stages/STAGE-40-SOURCE-PARITY-AUDIT.json'));
  assert.equal(audit.stage, 40);
  assert.equal(audit.iteration, 10);
  assert.equal(audit.families.length, 17);
  assert.equal(new Set(audit.families.map((family) => family.sourceFile)).size, 17);
  assert.equal(audit.summary.exactCommandParityProven, false);
  assert.equal(audit.summary.allFamiliesTransplanted, false);
  for (const family of audit.families) {
    assert.ok(family.sourceFile.endsWith('.js'));
    assert.ok(Number.isInteger(family.sourceCommandCountRecorded) && family.sourceCommandCountRecorded >= 0);
    assert.ok(family.nextAction.length > 10, `${family.sourceFile} needs a concrete next action`);
    assert.ok(['mapped_partial', 'mapped_review', 'gap_confirmed', 'source_module'].includes(family.status));
    if (family.status === 'gap_confirmed') assert.equal(family.targetFiles.length, 0);
    else assert.ok(family.targetFiles.length > 0, `${family.sourceFile} needs a target mapping`);
  }
});

test('Every concrete target in the Stage 40 audit exists in the current tree', async () => {
  audit ??= JSON.parse(await read('docs/stages/STAGE-40-SOURCE-PARITY-AUDIT.json'));
  const missing = [];
  for (const family of audit.families) {
    for (const target of family.targetFiles) {
      try { await access(path.join(root, target)); } catch { missing.push(`${family.sourceFile} -> ${target}`); }
    }
  }
  assert.deepEqual(missing, [], `stale parity mappings: ${missing.join(', ')}`);
});

test('Stage 40 Iteration 10 docs disclose offline source audit limits and confirmed gaps', async () => {
  const doc = await read('docs/stages/STAGE-40-ITERATION-10.md');
  const report = await read('docs/stages/TEST-REPORT-STAGE-40-ITERATION-10.md');
  const readme = await read('README.md');
  const docsReadme = await read('docs/README.md');
  assert.match(doc, /exact command-by-command parity is not claimed/i);
  assert.match(doc, /converter\.js/i);
  assert.match(doc, /tts\.js/i);
  assert.match(report, /source repository could not be re-fetched/i);
  assert.match(readme, /STAGE-40-SOURCE-PARITY-AUDIT\.json/);
  assert.match(docsReadme, /STAGE-40-SOURCE-PARITY-AUDIT\.json/);
});

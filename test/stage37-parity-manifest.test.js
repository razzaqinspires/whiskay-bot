import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');

let manifest;
let readme;
let docsReadme;
let stageDoc;

test('Stage 37 parity manifest is valid and includes all 17 audited event families', async () => {
  manifest = JSON.parse(await read('docs/stages/STAGE-37-EXPERIMENTAL-BELL-PARITY.json'));
  assert.equal(manifest.stage, 37);
  assert.equal(manifest.families.length, 17);
  assert.equal(new Set(manifest.families.map((item) => item.sourceFile)).size, 17);
  for (const family of manifest.families) {
    assert.ok(family.sourceFile.endsWith('.js'), `invalid source filename: ${family.sourceFile}`);
    assert.ok(['existing', 'partial', 'gap', 'new', 'pending'].includes(family.status), family.sourceFile);
    assert.ok(family.target, `missing target mapping for ${family.sourceFile}`);
    assert.ok(['P0', 'P1', 'P2'].includes(family.priority), family.sourceFile);
    assert.ok(Number.isInteger(family.capturedCommands) && family.capturedCommands >= 0, family.sourceFile);
  }
  assert.equal(manifest.completion.allFamiliesTransplanted, false, 'must not claim completion without proof');
});

test('Stage 37 documentation explicitly preserves game-family parity requirements', async () => {
  stageDoc = await read('docs/stages/STAGE-37.md');
  assert.match(stageDoc, /command-by-command/i);
  assert.match(stageDoc, /family100/i);
  assert.match(stageDoc, /susunkata/i);
  assert.match(stageDoc, /tebakgambar/i);
  assert.match(stageDoc, /tebakanime/i);
  assert.match(stageDoc, /transplant not complete/i);
});

test('root README and docs README link Stage 37 and require documentation updates', async () => {
  readme = await read('README.md');
  docsReadme = await read('docs/README.md');
  assert.match(readme, /Stage 37 — Experimental-Bell parity transplant/i);
  assert.match(readme, /STAGE-37\.md/);
  assert.match(docsReadme, /STAGE-37\.md/);
  assert.match(docsReadme, /STAGE-37-EXPERIMENTAL-BELL-PARITY\.json/);
});

test('Stage 37 parity manifest excludes secret-bearing runtime artifacts', async () => {
  const manifestText = await read('docs/stages/STAGE-37-EXPERIMENTAL-BELL-PARITY.json');
  assert.doesNotMatch(manifestText, /(?:sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY)/);
  assert.doesNotMatch(manifestText, /\.env(?:\.local)?\s*:/i);
});

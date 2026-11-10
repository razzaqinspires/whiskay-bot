import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const paths = [
  'src/plugins/general/adzan.js',
  'test/stage48-teamdrop-relay.test.js',
  'vendor/razzaq-adzan-engine/src/prayer-times.mjs',
];

test('reported Git upload whitespace defects stay fixed', async () => {
  for (const path of paths) {
    const content = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    const lines = content.split('\n');
    assert.equal(lines.at(-1), '', `${path}: file must end with exactly one newline`);
    assert.notEqual(lines.at(-2), '', `${path}: extra blank line at EOF`);
    for (let index = 0; index < lines.length - 1; index += 1) {
      assert.equal(lines[index], lines[index].replace(/[\t ]+$/u, ''), `${path}:${index + 1}: trailing whitespace`);
    }
  }
});

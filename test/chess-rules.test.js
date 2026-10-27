import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('chess plugin declares user-bound move and outsider checks', async () => {
  const source = await readFile(new URL('../src/plugins/games/chess.js', import.meta.url), 'utf8');
  assert.match(source, /game\.white,game\.black/);
  assert.match(source, /warnings>=3/);
  assert.match(source, /isLegalPseudo/);
  assert.match(source, /single_select/);
});

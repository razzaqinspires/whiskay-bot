import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('chess plugin declares user-bound move and outsider checks', async () => {
  const source = await readFile(new URL('../src/plugins/games/chess.js', import.meta.url), 'utf8');
  assert.match(source, /game\.white,game\.black/);
  assert.match(source, /chess\.move\(\{from,to,promotion\}\)/);
  assert.match(source, /if\(!\[game\.white,game\.black\]\.includes\(sender\)\)/);
  assert.match(source, /single_select/);
  assert.match(source, /isLegalPseudo/);
  assert.match(source, /warnings>=3/);
  assert.match(source, /outsiderWarnings/);
});

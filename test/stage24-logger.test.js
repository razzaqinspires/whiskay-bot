import test from 'node:test';
import assert from 'node:assert/strict';
import { setLogTheme, logger } from '../src/utils/logger.js';
import { readFileSync, rmSync } from 'node:fs';
test('Stage 24 logger supports five themes and persists selection', () => {
  for (let i=1;i<=5;i++) assert.ok(logger.themes[i]);
  assert.equal(setLogTheme(4), 'Corporate');
  const data=JSON.parse(readFileSync('data/log-preferences.json','utf8'));
  assert.equal(data.theme,4);
  assert.throws(()=>setLogTheme(6), /1–5/);
  rmSync('data/log-preferences.json',{force:true});
});

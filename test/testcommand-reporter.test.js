import test from 'node:test';
import assert from 'node:assert/strict';
import reporter from '../scripts/testcommand-reporter.mjs';

async function collect(events) {
  const source = async function* () { for (const event of events) yield event; };
  const output = [];
  for await (const line of reporter(source())) output.push(JSON.parse(line));
  return output;
}

test('Whiskay test reporter streams discovered, passed, failed and final counters', async () => {
  const output = await collect([
    { type: 'test:enqueue', data: { name: 'alpha' } },
    { type: 'test:pass', data: { name: 'alpha', details: { duration_ms: 1 } } },
    { type: 'test:enqueue', data: { name: 'beta' } },
    { type: 'test:fail', data: { name: 'beta', details: { duration_ms: 2 } } },
  ]);
  assert.equal(output[0].type, 'discovered');
  assert.deepEqual(output.at(-1).counts, { discovered: 2, completed: 2, passed: 1, failed: 1, skipped: 0 });
  assert.equal(output.at(-1).tests, 2);
});

test('Whiskay test reporter forwards diagnostics without hiding failure context', async () => {
  const output = await collect([{ type: 'test:diagnostic', data: { message: 'AssertionError at test/sample.test.js:8:2' } }]);
  assert.equal(output[0].type, 'diagnostic');
  assert.match(output[0].message, /sample\.test\.js:8:2/);
});

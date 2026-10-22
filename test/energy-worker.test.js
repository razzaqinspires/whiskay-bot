import test from 'node:test';
import assert from 'node:assert/strict';
import { complexityScore } from '../src/lib/energy-worker.js';
test('energy cost is bounded and decimal',()=>{const a=complexityScore('ping');assert.ok(a>=0.25&&a<=8.75);assert.equal(Math.round(a*100),a*100);});
test('long and math-heavy commands cost more than simple command',()=>{assert.ok(complexityScore('calculate 5 + 8 * 9 = x')>complexityScore('ping'));});
test('similarity discounts repeated command modestly',()=>{assert.ok(complexityScore('menu ping', ['menu ping'])<=complexityScore('menu ping', []));});

import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRecommendationCandidates, isGroupChat } from '../src/lib/stage30-recommendations.js';

test('group chat detection recognizes group JIDs and explicit flag', () => {
  assert.equal(isGroupChat('123@g.us'), true);
  assert.equal(isGroupChat('628123@s.whatsapp.net'), false);
  assert.equal(isGroupChat('', true), true);
});

test('recommendations exclude owner, premium, limit, coin and wrong chat context', () => {
  const rows = [
    { command: 'help' }, { command: 'kick', groupOnly: true },
    { command: 'owner-tool', owner: true }, { command: 'premium-tool', premium: true },
    { command: 'limited', limitCost: 2 }, { command: 'modcoin', coinCost: 5 },
    { command: 'private', privateOnly: true }
  ];
  const result = filterRecommendationCandidates(rows, { chatId: '628123@s.whatsapp.net', limit: 0, modCoins: 0 });
  assert.deepEqual(result.map(x => x.command), ['help', 'private']);
});

test('authorized capabilities are retained and candidates are never mutated', () => {
  const row = { command: 'guild', groupOnly: true, premium: true, limitCost: 1, coinCost: 2 };
  const result = filterRecommendationCandidates([row], { chatId: '123@g.us', isPremium: true, limit: 1, modCoins: 2 });
  assert.equal(result.length, 1);
  assert.deepEqual(row, { command: 'guild', groupOnly: true, premium: true, limitCost: 1, coinCost: 2 });
});

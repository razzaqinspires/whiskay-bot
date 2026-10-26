import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const temp = mkdtempSync(path.join(os.tmpdir(), 'whiskay-group-policy-'));
process.env.WHISKAY_DATA_DIR = temp;
const policy = await import('../src/lib/group-policy.js');
const groupA='120363012345678901@g.us';
const groupB='120363098765432109@g.us';
test.after(() => rmSync(temp,{recursive:true,force:true}));

test('per-group mute persists and unmute restores access', () => {
  policy.muteGroup(groupA);
  assert.equal(policy.isGroupMuted(groupA),true);
  assert.equal(policy.isGroupMuted(groupB),false);
  policy.unmuteGroup(groupA);
  assert.equal(policy.isGroupMuted(groupA),false);
});

test('onlyhere mutes every other group and reset removes global mute mode', () => {
  policy.setOnlyGroup(groupA);
  assert.equal(policy.isGroupMuted(groupA),false);
  assert.equal(policy.isGroupMuted(groupB),true);
  policy.resetGroupMutePolicy();
  assert.equal(policy.isGroupMuted(groupB),false);
});

test('resetting mute policy preserves group safety settings', () => {
  policy.updateGroupSettings(groupA,{textGuard:true,antiBanWord:true,banWords:['bad phrase']});
  policy.setOnlyGroup(groupA);
  policy.resetGroupMutePolicy();
  assert.equal(policy.getGroupSettings(groupA).textGuard,true);
  assert.equal(policy.getGroupSettings(groupA).antiBanWord,true);
});

test('toxic filter is opt-in and supports word-boundary matching', () => {
  policy.updateGroupSettings(groupA,{toxic:false,toxicWords:['rude word']});
  assert.equal(policy.inspectGroupText(groupA,'rude word').action,'allow');
  policy.updateGroupSettings(groupA,{toxic:true});
  assert.equal(policy.inspectGroupText(groupA,'kamu goblok').reason,'blocked_word');
  assert.equal(policy.inspectGroupText(groupA,'anjing laut').action,'block');
});

test('custom ban-word filter can block configured phrases', () => {
  policy.updateGroupSettings(groupA,{antiBanWord:true,banWords:['spoiler phrase']});
  assert.equal(policy.inspectGroupText(groupA,'ada spoiler phrase di sini').reason,'blocked_word');
  assert.equal(policy.inspectGroupText(groupA,'spoiler phrases').action,'allow');
});

test('text guard catches extreme character floods and zero-width attacks', () => {
  policy.updateGroupSettings(groupA,{textGuard:true});
  assert.equal(policy.inspectGroupText(groupA,'A'.repeat(100)).reason,'text_flood');
  assert.equal(policy.inspectGroupText(groupA,('spam ').repeat(25)).reason,'text_flood');
  assert.equal(policy.inspectGroupText(groupA,('x\u200b').repeat(30)).reason,'text_flood');
});

test('text normalization strips invisible controls without changing ordinary text', () => {
  assert.equal(policy.normalizeMessageText('Halo\u200b   dunia'), 'Halo dunia');
});

test('group guard suppresses muted-group messages but permits owner recovery command', async () => {
  const { applyGroupGuard } = await import('../src/lib/group-guard.js');
  policy.muteGroup(groupB);
  assert.equal((await applyGroupGuard({isGroup:true,chat:groupB,body:'.rpg status',isOwner:false})).action,'muted');
  assert.equal((await applyGroupGuard({isGroup:true,chat:groupB,body:'.groupbot unmute',isOwner:true})).action,'allow');
  assert.equal((await applyGroupGuard({isGroup:true,chat:groupA,body:'.rpg status',isOwner:false})).action,'allow');
});

test('group plugins expose owner controls and admin safety commands', async () => {
  const { default: ownerPlugin } = await import('../src/plugins/owner/group-control.js');
  const { default: safetyPlugin } = await import('../src/plugins/general/group-safety.js');
  assert.equal(ownerPlugin.owner,true);
  assert.ok(ownerPlugin.command.includes('groupbot'));
  for (const command of ['antitoxic','antibanword','textguard','groupstatus','grouphelp']) assert.ok(safetyPlugin.command.includes(command));
});


test('guard fails closed when group metadata is unavailable', async () => {
  const { applyGroupGuard } = await import('../src/lib/group-guard.js');
  policy.updateGroupSettings(groupA,{toxic:true,textGuard:true});
  const verdict=await applyGroupGuard({isGroup:true,chat:groupA,body:'kamu goblok','groupMetadata':null,isOwner:false,isAdmin:false,isBotAdmin:true,delete:async()=>{throw new Error('should not delete')}});
  assert.equal(verdict.reason,'group_metadata_unavailable');
  assert.equal(verdict.action,'allow');
});

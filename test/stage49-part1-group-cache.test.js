import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GroupMetadataStore } from '../src/services/groupMetadataStore.js';

const group = '120363012345678901@g.us';
const owner = '6281111111111@s.whatsapp.net';
const member = '6282222222222@s.whatsapp.net';

async function makeStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-group-cache-'));
  const store = new GroupMetadataStore({ file: path.join(dir, 'group-metadata.json'), persistDelayMs: 0 });
  await store.load();
  return { dir, store };
}

test('group metadata store persists initial snapshot atomically and reloads it', async () => {
  const { dir, store } = await makeStore();
  try {
    store.upsert({ id: group, subject: 'Tim Whiskay', owner, creation: 1720000000, participants: [{ id: owner, admin: 'superadmin' }, { id: member }] });
    store.markInitialSnapshot();
    await store.flush();
    const saved = JSON.parse(await readFile(path.join(dir, 'group-metadata.json'), 'utf8'));
    assert.equal(saved.snapshotComplete, true);
    assert.equal(saved.groups[group].subject, 'Tim Whiskay');
    assert.equal(saved.groups[group].participants.length, 2);

    const reloaded = new GroupMetadataStore({ file: path.join(dir, 'group-metadata.json') });
    await reloaded.load();
    assert.equal(reloaded.hasInitialSnapshot(), true);
    assert.equal(reloaded.get(group).participants.length, 2);
  } finally { await store.flush().catch(() => {}); await rm(dir, { recursive: true, force: true }); }
});

test('groups.update merges partial metadata and retains participant cache', async () => {
  const { dir, store } = await makeStore();
  try {
    store.upsert({ id: group, subject: 'Old name', participants: [{ id: member }] });
    store.applyGroupUpdates([{ id: group, subject: 'New name', announce: true }]);
    assert.equal(store.get(group).subject, 'New name');
    assert.equal(store.get(group).announce, true);
    assert.equal(store.get(group).participants.length, 1);
  } finally { await store.flush().catch(() => {}); await rm(dir, { recursive: true, force: true }); }
});

test('participant events incrementally add, promote, demote and remove members', async () => {
  const { dir, store } = await makeStore();
  try {
    store.upsert({ id: group, subject: 'Tim', participants: [{ id: owner, admin: 'superadmin' }] });
    store.applyParticipantUpdate({ id: group, action: 'add', participants: [{ id: member, name: 'Anggota Baru' }] });
    assert.equal(store.get(group).participants.length, 2);
    store.applyParticipantUpdate({ id: group, action: 'promote', participants: [{ id: member }] });
    assert.equal(store.get(group).participants.find(row => row.id === member).admin, 'admin');
    store.applyParticipantUpdate({ id: group, action: 'demote', participants: [{ id: member }] });
    assert.equal(store.get(group).participants.find(row => row.id === member).admin, null);
    store.applyParticipantUpdate({ id: group, action: 'remove', participants: [member] });
    assert.deepEqual(store.get(group).participants.map(row => row.id), [owner]);
  } finally { await store.flush().catch(() => {}); await rm(dir, { recursive: true, force: true }); }
});

test('bot removal event drops the group record from local metadata cache', async () => {
  const { dir, store } = await makeStore();
  try {
    store.upsert({ id: group, subject: 'Tim', participants: [{ id: owner }] });
    store.applyParticipantUpdate({ id: group, action: 'remove', participants: [owner] }, [owner]);
    assert.equal(store.get(group), null);
    assert.equal(store.count(), 0);
  } finally { await store.flush().catch(() => {}); await rm(dir, { recursive: true, force: true }); }
});

test('owner commands use cache-based listgc and expose joingc as an owner-only command', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/plugins/owner/owner-parity.js', import.meta.url), 'utf8');
  assert.match(source, /command: \['listgc'.*'joingc'/);
  assert.match(source, /if \(!ctx\.isOwner\)/);
  assert.match(source, /name: 'single_select', title: 'Pilih grup untuk detail'/);
  assert.match(source, /listgc detail/);
  assert.match(source, /listgc members/);
  assert.doesNotMatch(source, /groupFetchAllParticipating\(\)/);
});

test('socket setup wires cachedGroupMetadata and the documented group lifecycle events', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/core/Bot.js', import.meta.url), 'utf8');
  assert.match(source, /cachedGroupMetadata: async jid => groupMetadataStore\.get\(jid\)/);
  for (const event of ['groups.upsert', 'groups.update', 'group-participants.update', 'chats.delete']) assert.ok(source.includes(`'${event}'`), `missing ${event}`);
  assert.match(source, /groupFetchAllParticipating\(\)/);
  assert.match(source, /hasInitialSnapshot\(\)/);
});

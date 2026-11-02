import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'whiskay-adzan-stage2-'));
process.env.WHISKAY_DATA_DIR = tempRoot;
const store = await import(`../src/services/AdzanProfileStore.js?test=${Date.now()}`);
const file = path.join(tempRoot, 'adzan-profiles.json');
const backup = `${file}.bak`;
const owner = '628111111111@s.whatsapp.net';
const user = '628222222222@s.whatsapp.net';

test('owner default and user location are isolated and user location takes precedence', async () => {
  await store.requestAdzanLocation(owner, { ownerDefault: true });
  const ownerSave = await store.saveAdzanSharedLocation(owner, { latitude: 3.5897, longitude: 98.6738, name: 'Medan', isOwner: true });
  assert.equal(ownerSave.saved, true);
  await store.requestAdzanLocation(user);
  const userSave = await store.saveAdzanSharedLocation(user, { latitude: -8.65, longitude: 115.2167, name: 'Denpasar' });
  assert.equal(userSave.saved, true);
  const own = await store.getEffectiveAdzanProfile(user);
  const other = await store.getEffectiveAdzanProfile('628333333333@s.whatsapp.net');
  assert.equal(own.source, 'user');
  assert.equal(own.location.name, 'Denpasar');
  assert.equal(other.source, 'owner-default');
  assert.equal(other.location.name, 'Medan');
});

test('location request is required and owner default cannot be written by a non-owner', async () => {
  const noRequest = await store.saveAdzanSharedLocation('628444444444@s.whatsapp.net', { latitude: 0, longitude: 0 });
  assert.equal(noRequest.saved, false);
  await store.requestAdzanLocation(user, { ownerDefault: true });
  const denied = await store.saveAdzanSharedLocation(user, { latitude: 1, longitude: 1, isOwner: false });
  assert.equal(denied.reason, 'owner-only');
});

test('IANA timezone is validated and stored per user', async () => {
  await store.setAdzanTimezone(user, 'Asia/Makassar');
  const profile = await store.getEffectiveAdzanProfile(user);
  assert.equal(profile.timezone, 'Asia/Makassar');
  await assert.rejects(() => store.setAdzanTimezone(user, 'Mars/Olympus'), /IANA timezone/);
});

test('backup is created and corrupt primary recovers from verified JSON backup', async () => {
  await store.setAdzanTimezone(user, 'Asia/Jakarta');
  const backupText = await readFile(backup, 'utf8');
  assert.equal(JSON.parse(backupText).schemaVersion, 1);
  await writeFile(file, '{broken-json', 'utf8');
  const recovered = await store.getEffectiveAdzanProfile(user);
  assert.equal(recovered.timezone, 'Asia/Makassar');
  assert.equal(JSON.parse(await readFile(file, 'utf8')).schemaVersion, 1);
});

test('backup write failure aborts mutation and preserves primary', async () => {
  const before = await readFile(file, 'utf8');
  await rm(backup, { force: true });
  await mkdir(backup);
  await assert.rejects(() => store.setAdzanTimezone(user, 'Asia/Jakarta'), /backup could not be secured/i);
  assert.equal(await readFile(file, 'utf8'), before);
});

test('profile store status reports primary and backup state', async () => {
  await rm(backup, { recursive: true, force: true });
  const status = await store.getAdzanProfileStoreStatus();
  assert.equal(status.schemaVersion, 1);
  assert.equal(status.files.primary.exists, true);
  assert.equal(status.users, 1);
});

test.after(async () => { await rm(tempRoot, { recursive: true, force: true }); });

test('legacy group settings migrate into the protected profile database', async () => {
  const migrationRoot = await mkdtemp(path.join(os.tmpdir(), 'whiskay-adzan-migration-'));
  try {
    await writeFile(path.join(migrationRoot, 'adzan-settings.json'), JSON.stringify({ version: 1, chats: { '1203@g.us': { enabled: true, timezone: 'Asia/Jakarta', times: { subuh: '04:50' } } } }));
    process.env.WHISKAY_DATA_DIR = migrationRoot;
    const migratedStore = await import(`../src/services/AdzanProfileStore.js?migration=${Date.now()}`);
    const migrated = await migratedStore.getAdzanSettings('1203@g.us');
    assert.equal(migrated.enabled, true);
    assert.equal(migrated.times.subuh, '04:50');
    const files = await import('node:fs/promises');
    const names = await files.readdir(migrationRoot);
    assert.ok(names.some(name => name.startsWith('adzan-settings.json.migrated-')));
  } finally {
    process.env.WHISKAY_DATA_DIR = tempRoot;
    await rm(migrationRoot, { recursive: true, force: true });
  }
});

test('legacy group reminder API uses the same protected JSON database', async () => {
  const { updateAdzanSettings, getAdzanSettings, dueAdzan, markAdzanSent } = store;
  const saved = await updateAdzanSettings('120363000000000000@g.us', { enabled: true, timezone: 'Asia/Jakarta', times: { subuh: '04:45' } });
  assert.equal(saved.enabled, true);
  const readBack = await getAdzanSettings('120363000000000000@g.us');
  assert.equal(readBack.times.subuh, '04:45');
  assert.equal(await markAdzanSent('120363000000000000@g.us', 'subuh', '2026-10-31', true), true);
  assert.equal((await getAdzanSettings('120363000000000000@g.us')).lastSent.subuh, '2026-10-31');
  assert.ok(Array.isArray(await dueAdzan(Date.UTC(2026, 9, 31, 0, 0))));
});

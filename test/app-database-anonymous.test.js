import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const temp = await mkdtemp(path.join(os.tmpdir(), 'whiskay-db-test-'));
process.env.WHISKAY_DATA_DIR = temp;
const db = await import('../src/lib/app-database.js?test=' + Date.now());

test('observed users are tracked without auto-registration', async () => {
  const u = await db.observeUser({ jid:'628111111111@s.whatsapp.net', pushName:'Test', chat:'628111111111@s.whatsapp.net' });
  assert.equal(u.registered, false);
  assert.equal((await db.getUserStats()).total, 1);
  assert.equal((await db.getUserStats()).registered, 0);
});
test('registration is explicit and top-up approval is idempotent', async () => {
  await db.registerUser('628111111111@s.whatsapp.net','Test');
  const tx = await db.createTopup('628111111111@s.whatsapp.net', 5000);
  const first = await db.approveTopup(tx.id,'owner');
  assert.equal(first.user.balance, 5000);
  await assert.rejects(() => db.approveTopup(tx.id,'owner'), /tidak ditemukan|sudah diproses/);
});
test('anonymous queue pairs two registered users and stops both sides', async () => {
  await db.registerUser('628222222222@s.whatsapp.net','A');
  await db.registerUser('628333333333@s.whatsapp.net','B');
  assert.equal((await db.addAnonymousToQueue('628222222222@s.whatsapp.net')).status,'waiting');
  const match = await db.addAnonymousToQueue('628333333333@s.whatsapp.net');
  assert.equal(match.status,'paired');
  assert.equal(await db.getAnonymousPartner('628222222222@s.whatsapp.net'),'628333333333@s.whatsapp.net');
  await db.stopAnonymous('628222222222@s.whatsapp.net');
  assert.equal(await db.getAnonymousPartner('628333333333@s.whatsapp.net'),'');
});
test('corrupt primary recovers from last known-good backup', async () => {
  await db.observeUser({ jid:'628444444444@s.whatsapp.net', pushName:'Recovery' });
  await writeFile(path.join(temp,'app-database.json'), '{broken-json', 'utf8');
  const recovered = await db.readAppDatabase();
  assert.ok(recovered.users['628111111111@s.whatsapp.net']);
});
test('balance cannot go negative', async () => {
  await assert.rejects(() => db.chargeBalance('628111111111@s.whatsapp.net', 999999), /Saldo tidak cukup/);
});
test.after(async () => { await rm(temp,{recursive:true,force:true}); });

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
import { createJadibotStore } from '../src/services/JadibotStore.js';

test('Jadibot rental store serializes concurrent mutations across store instances', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-jadibot-store-'));
  try {
    const first = createJadibotStore(root);
    const second = createJadibotStore(root);
    await Promise.all(Array.from({ length: 24 }, (_, index) => (index % 2 ? first : second).changeRentals(data => {
      data.counter = (data.counter || 0) + 1;
    })));
    assert.equal((await first.readRentals()).counter, 24);
    const backup = JSON.parse(await readFile(`${first.rentalsFile}.bak`, 'utf8'));
    assert.equal(typeof backup.counter, 'number');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Jadibot data corruption fails closed and is not overwritten as an empty store', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-jadibot-corrupt-'));
  try {
    const store = createJadibotStore(root);
    await writeFile(store.rentalsFile, '{not-json', { mode: 0o600 });
    await assert.rejects(store.readRentals(), error => error.code === 'WHISKAY_DATA_CORRUPT');
    await assert.rejects(store.changeRentals(data => { data.recovered = true; }), error => error.code === 'WHISKAY_DATA_CORRUPT');
    assert.equal(await readFile(store.rentalsFile, 'utf8'), '{not-json');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Jadibot settings use a persistent atomic store', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-jadibot-settings-'));
  try {
    const store = createJadibotStore(root);
    await store.writeSettings({ days: 45, price: 25000 });
    assert.deepEqual(await store.readSettings(), { days: 45, price: 25000 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Jadibot rental mutations serialize across independent Node processes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-jadibot-processes-'));
  const moduleUrl = new URL('../src/services/JadibotStore.js', import.meta.url).href;
  const source = `import { createJadibotStore } from ${JSON.stringify(moduleUrl)};\nconst store = createJadibotStore(process.argv[1]);\nfor (let i = 0; i < 12; i++) await store.changeRentals(data => { data.counter = (data.counter || 0) + 1; });`;
  try {
    await Promise.all([1, 2].map(() => execFileAsync(process.execPath, ['--input-type=module', '-e', source, root], { timeout: 15000 })));
    const store = createJadibotStore(root);
    assert.equal((await store.readRentals()).counter, 24);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

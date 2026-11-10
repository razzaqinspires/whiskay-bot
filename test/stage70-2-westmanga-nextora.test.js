import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeWestmangaArray, normalizeWestmangaHomePayload } from '../src/services/westmanga-normalizer.js';

test('Westmanga home normalizer tolerates null, object, and wrapped list values', () => {
  assert.deepEqual(normalizeWestmangaArray(null), []);
  assert.deepEqual(normalizeWestmangaArray({ unexpected: true }), []);
  assert.deepEqual(normalizeWestmangaArray({ data: [{ slug: 'a' }] }), [{ slug: 'a' }]);
  assert.deepEqual(normalizeWestmangaArray([{ slug: 'b' }]), [{ slug: 'b' }]);
});

test('Westmanga home normalizer maps valid categories and skips invalid entries', () => {
  const result = normalizeWestmangaHomePayload({
    data: {
      mirror_update: [{ id: 1, title: 'Mirror', slug: 'mirror', cover: '/m.jpg', lastChapters: null }],
      popular: { items: [{ id: 2, title: 'Popular', slug: 'popular' }] },
      new_project: null,
      project_update: { broken: 'shape' }
    }
  }, url => `https://v1.westmanga.my${url}`);
  assert.equal(result.mirrorUpdates.length, 1);
  assert.equal(result.mirrorUpdates[0].cover, 'https://v1.westmanga.my/m.jpg');
  assert.deepEqual(result.mirrorUpdates[0].lastChapters, []);
  assert.equal(result.popular[0].slug, 'popular');
  assert.deepEqual(result.newProjects, []);
  assert.deepEqual(result.projectUpdates, []);
});

test('Nextora captures failures and diagnoses bounded source dependency graph', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-nextora-queue-'));
  const previous = process.env.WHISKAY_DATA_DIR;
  process.env.WHISKAY_DATA_DIR = dir;
  try {
    const mod = await import(`../src/services/nextora-repair/NextoraRepairService.js?test=${Date.now()}`);
    const task = await mod.recordNextoraFailure({
      command: 'wmhome', error: 'list.map is not a function',
      sourceFile: 'src/plugins/general/westmanga.js', stack: 'TypeError: list.map is not a function',
      correlationId: 'test-correlation', chat: 'chat', sender: 'sender'
    });
    assert.match(task.id, /^[a-f0-9]{12}$/);
    const tasks = await mod.listNextoraFailures();
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].status, 'queued');
    const diagnosed = await mod.diagnoseNextoraFailure(task.id);
    assert.ok(diagnosed.report.dependencyCount >= 1);
    assert.equal(diagnosed.report.sourceFile, 'src/plugins/general/westmanga.js');
    assert.equal((await mod.getNextoraFailure(task.id)).status, 'diagnosed');
    assert.equal(await mod.recordNextoraFailure({ command: 'bad', error: 'x', sourceFile: '../.env' }).then(x => x.sourceFile), null);
  } finally {
    if (previous === undefined) delete process.env.WHISKAY_DATA_DIR; else process.env.WHISKAY_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

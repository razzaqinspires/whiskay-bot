import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import controller, { formatWestmangaResult, parseWestmangaTarget, getWestmangaControllerStatus } from '../src/services/WestmangaLibraryController.js';
import { classifyJavaScriptChange } from '../src/core/JavaScriptModulePolicy.js';
import { isRepairablePath } from '../scripts/git-upload-repair.mjs';
import { isAIRepairablePath, validateRepairPayload } from '../scripts/nexora-git-repair.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'src/lib/external/westmanga/westmanga-scraper.cjs');
const expectedSha256 = '59247bda46d1404cf643a76c4c34ba7bec95c90e3ef94095bdce2254bce4c20b';

test('friend-supplied CJS source remains byte-for-byte unchanged', async () => {
  const source = await readFile(sourcePath);
  assert.equal(createHash('sha256').update(source).digest('hex'), expectedSha256);
});

test('third-party library path is excluded from universal JS reload', () => {
  const result = classifyJavaScriptChange('lib/external/westmanga/westmanga-scraper.cjs');
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'protected-third-party-library');
});

test('third-party library path is excluded from automatic git repair', () => {
  assert.equal(isRepairablePath('src/lib/external/westmanga/westmanga-scraper.cjs'), false);
  assert.equal(isRepairablePath('src/services/WestmangaLibraryController.js'), true);
  assert.equal(isAIRepairablePath('src/lib/external/westmanga/westmanga-scraper.cjs'), false);
  assert.equal(isAIRepairablePath('src/services/WestmangaLibraryController.js'), true);
  assert.throws(() => validateRepairPayload({ files: [{ path: 'src/lib/external/westmanga/westmanga-scraper.cjs', content: 'changed' }] }, ['src/lib/external/westmanga/westmanga-scraper.cjs']), /AI path rejected/);
});

test('CJS library is loaded through the controller without modifying it', () => {
  const status = getWestmangaControllerStatus();
  assert.equal(status.sourceFormat, 'CommonJS (.cjs)');
  assert.equal(status.sourceProtected, true);
  assert.ok(status.providers.some(provider => provider.id === 'westmanga'));
  assert.equal(typeof controller.search, 'function');
});

test('target parser accepts supported Westmanga comic and chapter targets', () => {
  assert.deepEqual(parseWestmangaTarget('cyberpunk-swordsman'), { type: 'comic', slug: 'cyberpunk-swordsman' });
  assert.deepEqual(parseWestmangaTarget('https://v1.westmanga.my/view/sample-chapter-01'), { type: 'read', slug: 'sample-chapter-01' });
});

test('target parser rejects foreign domains and invalid slug characters', () => {
  assert.throws(() => parseWestmangaTarget('https://example.com/comic/test'), /Domain/);
  assert.throws(() => parseWestmangaTarget('../secret'), /Slug/);
});

test('response formatter supports compact and detailed styles and keeps attribution', () => {
  const payload = { result: { results: [{ title: 'Example', slug: 'example', status: 'Ongoing', rating: 9, cover: 'https://example.test/cover.jpg' }] }, attribution: 'Original Westmanga source' };
  assert.match(formatWestmangaResult('search', payload, 'compact'), /Example/);
  assert.match(formatWestmangaResult('search', payload, 'compact'), /Original Westmanga source/);
  assert.match(formatWestmangaResult('search', payload, 'minimal'), /example/);
});

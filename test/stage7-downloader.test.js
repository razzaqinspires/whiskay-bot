import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMediaUrl, platformMatches } from '../src/services/mediaDownloader.js';
test('normalizes only HTTP(S) media URLs',()=>{assert.equal(normalizeMediaUrl('https://www.tiktok.com/@x/video/1'),'https://www.tiktok.com/@x/video/1');assert.throws(()=>normalizeMediaUrl('javascript:alert(1)'));assert.throws(()=>normalizeMediaUrl('https://u:p@example.com'));});
test('platform host validation rejects unrelated domains',()=>{assert.equal(platformMatches('tiktok','https://vm.tiktok.com/abc'),true);assert.equal(platformMatches('instagram','https://example.com/reel'),false);assert.equal(platformMatches('facebook','https://fb.watch/abc'),true);});

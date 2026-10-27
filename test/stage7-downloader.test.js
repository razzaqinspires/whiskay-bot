import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMediaUrl, platformMatches, getDownloaderEndpoints } from '../src/services/mediaDownloader.js';
test('normalizes only HTTP(S) media URLs',()=>{assert.equal(normalizeMediaUrl('https://www.tiktok.com/@x/video/1'),'https://www.tiktok.com/@x/video/1');assert.throws(()=>normalizeMediaUrl('javascript:alert(1)'));assert.throws(()=>normalizeMediaUrl('https://u:p@example.com'));});
test('platform host validation rejects unrelated domains',()=>{assert.equal(platformMatches('tiktok','https://vm.tiktok.com/abc'),true);assert.equal(platformMatches('instagram','https://example.com/reel'),false);assert.equal(platformMatches('facebook','https://fb.watch/abc'),true);});

test('downloader provider fallback list validates HTTP(S), removes duplicates, and caps provider count',()=>{const rows=getDownloaderEndpoints({MEDIA_DOWNLOADER_API_URLS:'https://one.example/api,https://two.example/api,ftp://bad.example,https://one.example/api',MEDIA_DOWNLOADER_API_URL:'https://three.example/api'});assert.deepEqual(rows,['https://one.example/api','https://two.example/api','https://three.example/api']);});

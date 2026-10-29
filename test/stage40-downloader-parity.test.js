import test from 'node:test';
import assert from 'node:assert/strict';
import { platformMatches, getDownloaderEndpoints, normalizeMediaUrl } from '../src/services/mediaDownloader.js';
import { existsSync } from 'node:fs';

const cases = [
  ['tiktok', 'https://www.tiktok.com/@user/video/123'],
  ['instagram', 'https://www.instagram.com/reel/abc/'],
  ['facebook', 'https://fb.watch/abc'],
  ['pinterest', 'https://pin.it/abc'],
  ['pinterest', 'https://www.pinterest.com/pin/123/'],
  ['mediafire', 'https://www.mediafire.com/file/abc/file.zip/file'],
  ['spotify', 'https://open.spotify.com/track/abc'],
  ['youtube', 'https://youtu.be/abc'],
  ['youtube', 'https://www.youtube.com/watch?v=abc'],
  ['rednote', 'https://www.xiaohongshu.com/explore/abc'],
  ['rednote', 'https://xhslink.com/a/abc'],
];
for (const [platform, url] of cases) test(`${platform} host allowlist accepts ${new URL(url).hostname}`, () => assert.equal(platformMatches(platform, normalizeMediaUrl(url)), true));

test('provider endpoint configuration deduplicates and rejects invalid schemes and credentials', () => {
  const endpoints = getDownloaderEndpoints({ MEDIA_DOWNLOADER_API_URLS: 'https://api.example.test/dl,ftp://bad.test,https://user:pass@bad.test/x;https://api.example.test/dl', MEDIA_DOWNLOADER_API_URL: 'http://fallback.example.test/dl' });
  assert.deepEqual(endpoints, ['https://api.example.test/dl', 'http://fallback.example.test/dl']);
});

test('URL normalization rejects invalid schemes and embedded credentials', () => {
  assert.throws(() => normalizeMediaUrl('javascript:alert(1)'), /HTTP\/HTTPS/);
  assert.throws(() => normalizeMediaUrl('https://user:pass@example.com/x'), /kredensial/);
});

test('all Stage 40 downloader adapters exist', () => {
  for (const file of ['pinterest-dl.js','mediafire-dl.js','spotify-dl.js','youtube-dl.js','rednote-dl.js']) assert.equal(existsSync(new URL(`../src/plugins/media/${file}`, import.meta.url)), true, file);
});

test('GitHub clone parser accepts public repo forms and optional branch', async () => {
  const { parseGitHubRepo } = await import('../src/services/githubClone.js');
  assert.deepEqual(parseGitHubRepo('Rifza123/Experimental-Bell'), { owner: 'Rifza123', repo: 'Experimental-Bell', branch: '', fullName: 'Rifza123/Experimental-Bell' });
  assert.equal(parseGitHubRepo('https://github.com/Rifza123/Experimental-Bell').fullName, 'Rifza123/Experimental-Bell');
  assert.equal(parseGitHubRepo('owner/repo#feature/test').branch, 'feature/test');
});

test('GitHub clone parser rejects non-GitHub hosts, credentials and malformed repository paths', async () => {
  const { parseGitHubRepo } = await import('../src/services/githubClone.js');
  assert.throws(() => parseGitHubRepo('https://evil.example/owner/repo'), /Hanya URL repository publik/);
  assert.throws(() => parseGitHubRepo('https://user:pass@github.com/owner/repo'), /Hanya URL repository publik/);
  assert.throws(() => parseGitHubRepo('owner'), /Format/);
  assert.throws(() => parseGitHubRepo('owner/repo#../secret'), /branch tidak valid/);
});

test('GitHub clone plugin and YouTube search/play aliases are registered in source', async () => {
  const { readFile } = await import('node:fs/promises');
  const plugin = await readFile(new URL('../src/plugins/media/gitclone.js', import.meta.url), 'utf8');
  const youtube = await readFile(new URL('../src/plugins/tools/youtube.js', import.meta.url), 'utf8');
  assert.match(plugin, /command:\s*\['gitclone'\]/);
  assert.match(youtube, /command:\s*\['ytsearch',\s*'yts'\]/);
  assert.match(youtube, /command:\s*\['ytplay',\s*'play',\s*'youtube',\s*'yt'\]/);
});


test('YouTube parity commands include M4A, voice-note and format-picker flows', async () => {
  const { default: plugins } = await import('../src/plugins/tools/youtube.js');
  const commands = new Set(plugins.flatMap(plugin => plugin.command || []));
  for (const command of ['ytm4a', 'playvn', 'dlvlink', 'ytmp3', 'ytmp4', 'ytsearch', 'yts', 'ytplay', 'play', 'youtube', 'yt']) {
    assert.equal(commands.has(command), true, `${command} must be registered`);
  }
});

test('YouTube media sender uses correct WhatsApp payload for M4A and Opus voice note', async () => {
  const { sendDownloadedMedia } = await import('../src/plugins/tools/youtube.js');
  const sent = [];
  const ctx = { chat: 'test@s.whatsapp.net', sock: { sendMessage: async (...args) => sent.push(args) } };
  await sendDownloadedMedia(ctx, 'm4a', Buffer.from('m4a'), '');
  await sendDownloadedMedia(ctx, 'voice', Buffer.from('opus'), '');
  assert.equal(sent[0][1].mimetype, 'audio/mp4');
  assert.equal(sent[0][1].fileName, 'whiskay-audio.m4a');
  assert.equal(sent[0][1].ptt, false);
  assert.equal(sent[1][1].mimetype, 'audio/ogg; codecs=opus');
  assert.equal(sent[1][1].fileName, 'whiskay-voice.opus');
  assert.equal(sent[1][1].ptt, true);
});

test('source downloader aliases are registered on the matching platform adapters', async () => {
  const specs = [
    ['../src/plugins/media/fb-dl.js', ['fbdl', 'facebook', 'facebookdl']],
    ['../src/plugins/media/ig-dl.js', ['igdl', 'instagram', 'instagramdl']],
    ['../src/plugins/media/tiktok-dl.js', ['ttdl', 'tt', 'tiktokdl', 'tiktokaudio', 'ttaudio', 'tiktokvn', 'ttvn']],
    ['../src/plugins/media/youtube-dl.js', ['youtube', 'ytdl', 'youtubedl', 'youtubedownloader']],
    ['../src/plugins/media/mediafire-dl.js', ['mediafiredl']],
    ['../src/plugins/media/pinterest-dl.js', ['pindl', 'pinterest']],
    ['../src/plugins/media/spotify-dl.js', ['spotdl', 'spodl']],
    ['../src/plugins/media/rednote-dl.js', ['renotedl', 'xiaohongshu']],
  ];
  for (const [file, expected] of specs) {
    const { default: plugin } = await import(file);
    for (const alias of expected) assert.ok(plugin.aliases?.includes(alias), `${file} should register alias ${alias}`);
  }
});

test('YouTube format picker offers MP3, M4A, voice note and MP4 after URL validation', async () => {
  const { default: plugins } = await import('../src/plugins/tools/youtube.js');
  const plugin = plugins.find(p => (p.command || []).includes('dlvlink'));
  let payload;
  const ctx = {
    args: ['https://youtu.be/abc123'], prefix: '.',
    sendInteractive: async value => { payload = value; return value; },
    reply: async value => { throw new Error(`unexpected reply: ${value}`); },
  };
  await plugin.execute(ctx);
  const ids = payload.buttons.map(button => button.id);
  assert.equal(ids.length, 4);
  assert.ok(ids.some(id => id.startsWith('.ytmp3 ')));
  assert.ok(ids.some(id => id.startsWith('.ytm4a ')));
  assert.ok(ids.some(id => id.startsWith('.playvn ')));
  assert.ok(ids.some(id => id.startsWith('.ytmp4 ')));
});

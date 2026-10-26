import test from 'node:test';
import assert from 'node:assert/strict';

process.env.WHISKAY_GITHUB_REPO = 'owner/whiskay-bot';
delete process.env.WHISKAY_GITHUB_TRAFFIC_TOKEN;
delete process.env.WHISKAY_GITHUB_TOKEN;
const plugin = (await import('../src/plugins/tools/github.js')).default;

function response(data, ok = true, status = 200) {
  return { ok, status, async json() { return data; } };
}

test('shows public repository stats and never fabricates traffic without token', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async url => {
    assert.equal(String(url), 'https://api.github.com/repos/owner/whiskay-bot');
    return response({ full_name: 'owner/whiskay-bot', description: 'test', private: false, stargazers_count: 3, forks_count: 2, subscribers_count: 1, open_issues_count: 4, default_branch: 'main', pushed_at: '2026-10-24T00:00:00Z', html_url: 'https://github.com/owner/whiskay-bot' });
  };
  let message = '';
  await plugin.execute({ command: 'github', args: [], reply: async text => { message = text; } });
  assert.match(message, /Stars: 3/);
  assert.match(message, /Forks: 2/);
  assert.match(message, /Pengunjung GitHub: data privat tidak tersedia/);
  assert.match(message, /tidak menyediakan total pengunjung sepanjang masa/);
});

test('lists recent commits from GitHub REST response', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async url => {
    assert.match(String(url), /\/repos\/owner\/whiskay-bot\/commits\?per_page=5$/);
    return response([{ sha: 'abc12345deadbeef', commit: { message: 'fix pairing portal', author: { date: '2026-10-24T00:00:00Z' } }, html_url: 'https://github.com/owner/whiskay-bot/commit/abc12345' }]);
  };
  let message = '';
  await plugin.execute({ command: 'githubcommits', args: [], reply: async text => { message = text; } });
  assert.match(message, /fix pairing portal/);
  assert.match(message, /abc12345/);
});

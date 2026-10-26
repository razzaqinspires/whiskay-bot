const API = 'https://api.github.com';
const TTL = 120_000;
let cache = { at: 0, repo: null, traffic: null };
const repoName = () => String(process.env.WHISKAY_GITHUB_REPO || process.env.GITHUB_REPOSITORY || '').trim();
const validRepo = value => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
const compact = n => new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n) || 0);
const time = value => value ? new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB' : '-';
async function githubJson(path, token = process.env.WHISKAY_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '') {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'WhiskayBot-GitHub-Stats', 'x-github-api-version': '2022-11-28' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { headers, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
  return response.json();
}
async function stats(force = false) {
  const repo = repoName();
  if (!validRepo(repo)) throw new Error('Repository belum diatur. Tambahkan WHISKAY_GITHUB_REPO=owner/whiskay-bot di .env lalu restart bot.');
  if (!force && cache.repo && cache.repo.full_name.toLowerCase() === repo.toLowerCase() && Date.now() - cache.at < TTL) return cache;
  const details = await githubJson(`/repos/${repo}`);
  let traffic = null, trafficError = '';
  const trafficToken = process.env.WHISKAY_GITHUB_TRAFFIC_TOKEN || process.env.WHISKAY_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
  if (trafficToken) {
    try {
      const [views, clones] = await Promise.all([
        githubJson(`/repos/${repo}/traffic/views`, trafficToken),
        githubJson(`/repos/${repo}/traffic/clones`, trafficToken)
      ]);
      traffic = { views: Number(views.count || 0), uniqueVisitors: Number(views.uniques || 0), clones: Number(clones.count || 0), uniqueCloners: Number(clones.uniques || 0), days: 14, observedAt: new Date().toISOString(), series: (views.views || []).map(v => ({ date: v.timestamp, views: v.count, uniques: v.uniques })) };
    } catch (error) { trafficError = error.message; }
  }
  cache = { at: Date.now(), repo: details, traffic, trafficError };
  return cache;
}
function formatStats(d) {
  const r = d.repo;
  const trafficLine = d.traffic
    ? `Pengunjung unik · 14 hari: ${compact(d.traffic.uniqueVisitors)}\nTampilan halaman · 14 hari: ${compact(d.traffic.views)}\nClone · 14 hari: ${compact(d.traffic.clones)} · Cloner unik: ${compact(d.traffic.uniqueCloners)}`
    : `Pengunjung GitHub: data privat tidak tersedia${d.trafficError ? ` (${d.trafficError})` : ''}\nAtur WHISKAY_GITHUB_TRAFFIC_TOKEN dengan akses traffic repository. GitHub tidak menyediakan total pengunjung sepanjang masa melalui endpoint traffic ini.`;
  return `🐙 *WHISKAY BOT · GITHUB*
Repository: ${r.full_name}
Deskripsi: ${r.description || '-'}
Visibility: ${r.private ? 'private' : 'public'}
⭐ Stars: ${compact(r.stargazers_count)}
🍴 Forks: ${compact(r.forks_count)}
👀 Watchers: ${compact(r.subscribers_count ?? r.watchers_count)}
🧩 Open issues/PR: ${compact(r.open_issues_count)}

📈 *TRAFFIC REPOSITORY*
${trafficLine}

Default branch: ${r.default_branch}
Update terakhir: ${time(r.pushed_at)}
Diperiksa: ${time(new Date().toISOString())}
${r.html_url}`;
}
export default {
  name: 'github-tools',
  command: ['github', 'githubstats', 'githubcommits', 'githubissues', 'githubflows'],
  aliases: ['gh', 'ghstats', 'ghcommits', 'ghissues', 'ghflows'],
  menuCommands: ['github', 'githubstats', 'githubcommits', 'githubissues', 'githubflows'],
  category: 'tools',
  description: 'Status repository GitHub, traffic, commit, issue dan workflow',
  cooldown: 5000,
  async execute(ctx) {
    const cmd = String(ctx.command || '').toLowerCase();
    try {
      const repo = repoName();
      if (!validRepo(repo)) return ctx.reply('🐙 Konfigurasi GitHub belum lengkap. Tambahkan `WHISKAY_GITHUB_REPO=owner/whiskay-bot` pada `.env`, lalu restart bot. Untuk traffic, tambahkan `WHISKAY_GITHUB_TRAFFIC_TOKEN` yang memiliki akses baca traffic repository.');
      if (['githubcommits', 'ghcommits'].includes(cmd) || (cmd === 'github' && String(ctx.args?.[0] || '').toLowerCase() === 'commits')) {
        const list = await githubJson(`/repos/${repo}/commits?per_page=5`);
        return ctx.reply(`🧾 *GITHUB · COMMITS TERBARU*\n${list.map((x, i) => `${i + 1}. ${String(x.commit?.message || '').split('\n')[0].slice(0, 100)}\n   ${x.sha?.slice(0, 8)} · ${x.commit?.author?.date ? time(x.commit.author.date) : '-'} · ${x.html_url}`).join('\n\n') || 'Belum ada commit.'}`);
      }
      if (['githubissues', 'ghissues'].includes(cmd) || (cmd === 'github' && String(ctx.args?.[0] || '').toLowerCase() === 'issues')) {
        const list = await githubJson(`/repos/${repo}/issues?state=open&per_page=8`);
        const onlyIssues = list.filter(x => !x.pull_request);
        return ctx.reply(`🧩 *GITHUB · ISSUE TERBUKA*\n${onlyIssues.map((x, i) => `${i + 1}. #${x.number} ${x.title}\n   ${x.html_url}`).join('\n\n') || 'Tidak ada issue terbuka.'}`);
      }
      if (['githubflows', 'ghflows'].includes(cmd) || (cmd === 'github' && ['flows', 'workflow', 'workflows'].includes(String(ctx.args?.[0] || '').toLowerCase()))) {
        const data = await githubJson(`/repos/${repo}/actions/runs?per_page=6`);
        return ctx.reply(`⚙️ *GITHUB ACTIONS · TERBARU*\n${(data.workflow_runs || []).map((x, i) => `${i + 1}. ${x.name || x.display_title}\n   Status: ${x.conclusion || x.status} · ${time(x.updated_at)}\n   ${x.html_url}`).join('\n\n') || 'Workflow tidak tersedia atau token tidak memiliki akses Actions.'}`);
      }
      const d = await stats(['githubstats', 'ghstats'].includes(cmd) || String(ctx.args?.[0] || '').toLowerCase() === 'refresh');
      return ctx.reply(formatStats(d));
    } catch (error) {
      return ctx.reply(`❌ Gagal membaca GitHub: ${error.message}\nPeriksa nama repository, koneksi internet, atau token akses. Perintah: .github, .github commits, .github issues, .github workflows.`);
    }
  }
};

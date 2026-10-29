const API = 'https://api.github.com';
const MAX_BYTES = 24 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const REPO_PART = /^[A-Za-z0-9_.-]{1,100}$/;
const BRANCH_PART = /^[A-Za-z0-9_./-]{1,180}$/;

export function parseGitHubRepo(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Masukkan URL atau owner/repo GitHub.');
  let owner, repo, branch = '';
  if (/^https?:\/\//i.test(raw)) {
    let url;
    try { url = new URL(raw); } catch { throw new Error('URL GitHub tidak valid.'); }
    if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase()) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Hanya URL repository publik github.com yang didukung.');
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2 || parts.length > 4 || ['settings', 'orgs', 'topics', 'marketplace', 'features', 'login'].includes((parts[0] || '').toLowerCase())) {
      throw new Error('Gunakan URL repository, misalnya https://github.com/owner/repo.');
    }
    [owner, repo] = parts;
    if (parts[2] === 'tree' && parts[3]) branch = parts[3];
    if (url.search) throw new Error('Query string tidak diperlukan pada URL repository.');
  } else {
    const [repoPath, requestedBranch = ''] = raw.split('#', 2);
    const parts = repoPath.split('/');
    if (parts.length !== 2) throw new Error('Format: .gitclone owner/repo atau URL repository GitHub.');
    [owner, repo] = parts;
    branch = requestedBranch;
  }
  repo = repo.replace(/\.git$/i, '');
  if (!REPO_PART.test(owner || '') || !REPO_PART.test(repo || '') || owner === '.' || repo === '.' || owner === '..' || repo === '..') {
    throw new Error('Nama owner/repository tidak valid.');
  }
  if (branch && (!BRANCH_PART.test(branch) || branch.includes('..') || branch.startsWith('/') || branch.endsWith('/'))) {
    throw new Error('Nama branch tidak valid.');
  }
  return { owner, repo, branch, fullName: `${owner}/${repo}` };
}

async function readLimited(response) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) throw new Error('Arsip repository melebihi batas 24 MB.');
  if (!response.body) throw new Error('Respons arsip kosong.');
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    const buf = Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BYTES) throw new Error('Arsip repository melebihi batas 24 MB.');
    chunks.push(buf);
  }
  if (!total) throw new Error('Arsip repository kosong.');
  return Buffer.concat(chunks, total);
}

export async function downloadPublicRepository(input, fetchImpl = fetch) {
  const repo = typeof input === 'string' ? parseGitHubRepo(input) : input;
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'WhiskayBot-GitClone', 'x-github-api-version': '2022-11-28' };
  const detailsResponse = await fetchImpl(`${API}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (detailsResponse.status === 404) throw new Error('Repository tidak ditemukan atau bersifat privat.');
  if (!detailsResponse.ok) throw new Error(`GitHub API gagal (HTTP ${detailsResponse.status}).`);
  const details = await detailsResponse.json();
  if (details.private || details.disabled || !details.default_branch) throw new Error('Repository tidak publik atau tidak dapat diunduh.');
  const branch = repo.branch || String(details.default_branch);
  if (!BRANCH_PART.test(branch) || branch.includes('..')) throw new Error('Nama branch tidak valid.');
  const archiveUrl = `${API}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/zipball/${branch.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetchImpl(archiveUrl, { headers: { ...headers, accept: 'application/vnd.github+json' }, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Unduhan arsip gagal (HTTP ${response.status}).`);
  let finalHost;
  try { finalHost = new URL(response.url || archiveUrl).hostname.toLowerCase(); } catch { throw new Error('Alamat arsip dari GitHub tidak valid.'); }
  if (!['api.github.com', 'codeload.github.com', 'github.com'].includes(finalHost)) throw new Error('GitHub mengarahkan unduhan ke host yang tidak diizinkan.');
  const buffer = await readLimited(response);
  return { buffer, fileName: `${repo.owner}-${repo.repo}-${branch.replace(/[^A-Za-z0-9._-]/g, '-')}.zip`.slice(0, 150), fullName: `${repo.owner}/${repo.repo}`, branch, size: buffer.length, url: `https://github.com/${repo.owner}/${repo.repo}` };
}

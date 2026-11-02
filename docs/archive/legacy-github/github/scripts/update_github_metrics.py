#!/usr/bin/env python3
"""Update non-destructive README metrics generated from the official GitHub REST API."""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
README = ROOT / 'README.md'
METRICS_DIR = ROOT / 'docs' / 'metrics'
CURRENT = METRICS_DIR / 'github-metrics.json'
HISTORY = METRICS_DIR / 'history.json'
REPO = os.environ.get('GITHUB_REPOSITORY', '').strip()
TOKEN = os.environ.get('GITHUB_TOKEN', '').strip()
TRAFFIC_TOKEN = os.environ.get('GH_TRAFFIC_TOKEN', '').strip()
API = 'https://api.github.com'


def request_json(endpoint, token, optional=False):
    headers = {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'WhiskayBot-GitHub-Metrics',
        'X-GitHub-Api-Version': '2022-11-28',
    }
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(API + endpoint, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            return json.loads(response.read().decode('utf-8'))
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as exc:
        if optional:
            return {'_unavailable': str(exc)}
        raise


def load_json(path, fallback):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return fallback


def short_date(raw):
    try:
        dt = datetime.fromisoformat(raw.replace('Z', '+00:00')).astimezone(timezone.utc)
        return dt.strftime('%m-%d')
    except Exception:
        return '--'


def mermaid_chart(title, labels, values):
    if not values:
        return f'> Grafik **{title}** akan muncul setelah metrik tersedia dari GitHub Actions.\n'
    # Labels use simple characters because Mermaid xychart labels are quoted strings.
    safe_labels = [x.replace('"', '')[:12] for x in labels]
    nums = [max(0, int(x or 0)) for x in values]
    maximum = max(nums) if nums else 0
    upper = max(1, int(maximum * 1.2 + 1))
    label_text = ', '.join('"' + x + '"' for x in safe_labels)
    value_text = ', '.join(str(x) for x in nums)
    return f'''```mermaid
xychart-beta
    title "{title}"
    x-axis [{label_text}]
    y-axis "Count" 0 --> {upper}
    line [{value_text}]
```
'''


def build_section(current, history):
    when = current.get('timestamp', 'not recorded')
    repo = current.get('repository', REPO or 'repository belum diketahui')
    rows = [
        f'> Snapshot terakhir: **{when}** (UTC). GitHub Actions dijadwalkan menyegarkan data setiap 6 jam dan saat ada push yang relevan.',
        '',
        '| Metrik | Nilai |',
        '|---|---:|',
        f'| Repository | [`{repo}`](https://github.com/{repo}) |',
        f'| ⭐ Stars | {current.get("stars", "n/a")} |',
        f'| 🍴 Forks | {current.get("forks", "n/a")} |',
        f'| 🧩 Open issues / PR | {current.get("openIssues", "n/a")} |',
    ]
    if current.get('trafficAvailable'):
        rows += [
            f'| 👥 Pengunjung unik (14 hari terakhir) | {current.get("uniqueVisitors14d", 0)} |',
            f'| 👁️ Tampilan halaman (14 hari terakhir) | {current.get("views14d", 0)} |',
            f'| 📦 Clone (14 hari terakhir) | {current.get("clones14d", 0)} |',
            f'| Akun unik yang melakukan clone (14 hari terakhir) | {current.get("uniqueCloners14d", 0)} |',
        ]
    else:
        rows += [
            '| 👥 Pengunjung unik (14 hari terakhir) | Belum tersedia — token traffic belum punya akses |',
            '| 👁️ Tampilan halaman (14 hari terakhir) | Belum tersedia |',
            '| 📦 Clone (14 hari terakhir) | Belum tersedia |',
        ]
    rows += ['', '**Catatan:** data traffic GitHub hanya tersedia untuk 14 hari terakhir melalui API, bukan jumlah pengunjung sepanjang masa. Untuk statistik itu, berikan secret `WHISKAY_GITHUB_TRAFFIC_TOKEN` dengan permission *Administration: Read* pada repository. Jika token tidak tersedia/ditolak, README tidak mengarang angka. [Dokumentasi API traffic](https://docs.github.com/en/rest/metrics/traffic).', '', '### Grafik traffic dan laju pembaruan', '']
    traffic_points = [x for x in history[-10:] if x.get('trafficAvailable') and isinstance(x.get('views14d'), int)]
    rows.append(mermaid_chart('GitHub page views · rolling 14-day total', [short_date(x['timestamp']) for x in traffic_points], [x['views14d'] for x in traffic_points]).rstrip())
    rows.append('')
    commit_snapshot = current.get('dailyCommits') or []
    rows.append(mermaid_chart('Commit activity · last 14 days', [x.get('date', '--')[5:] for x in commit_snapshot[-10:]], [x.get('count', 0) for x in commit_snapshot[-10:]]).rstrip())
    rows += ['', f'Riwayat snapshot tersimpan: **{len(history)}** (maksimum 90 snapshot lokal di berkas metrik). Buka [Insights → Traffic](https://github.com/{repo}/graphs/traffic) untuk tampilan paling mutakhir langsung dari GitHub.', '']
    return '\n'.join(rows)


def main():
    if not REPO or '/' not in REPO:
        raise SystemExit('GITHUB_REPOSITORY tidak valid; workflow harus dijalankan dalam konteks repository GitHub.')
    now = datetime.now(timezone.utc)
    details = request_json(f'/repos/{urllib.parse.quote(REPO, safe="/")}', TOKEN)
    traffic_available = False
    views = {'_unavailable': 'traffic token not configured'}
    clones = {'_unavailable': 'traffic token not configured'}
    if TRAFFIC_TOKEN:
        encoded = urllib.parse.quote(REPO, safe='/')
        views = request_json(f'/repos/{encoded}/traffic/views', TRAFFIC_TOKEN, optional=True)
        clones = request_json(f'/repos/{encoded}/traffic/clones', TRAFFIC_TOKEN, optional=True)
        traffic_available = '_unavailable' not in views and '_unavailable' not in clones
    since = (now - timedelta(days=14)).isoformat(timespec='seconds').replace('+00:00', 'Z')
    until = now.isoformat(timespec='seconds').replace('+00:00', 'Z')
    commit_response = request_json(f'/repos/{urllib.parse.quote(REPO, safe="/")}/commits?per_page=100&since={urllib.parse.quote(since)}&until={urllib.parse.quote(until)}', TOKEN, optional=True)
    day_counts = {}
    if isinstance(commit_response, list):
        for commit in commit_response:
            date = (((commit.get('commit') or {}).get('author') or {}).get('date') or '')[:10]
            if date:
                day_counts[date] = day_counts.get(date, 0) + 1
    daily_commits = []
    for i in range(13, -1, -1):
        date = (now.date() - timedelta(days=i)).isoformat()
        daily_commits.append({'date': date, 'count': day_counts.get(date, 0)})
    record = {
        'timestamp': now.isoformat(timespec='seconds'),
        'repository': details.get('full_name', REPO),
        'stars': int(details.get('stargazers_count', 0)),
        'forks': int(details.get('forks_count', 0)),
        'openIssues': int(details.get('open_issues_count', 0)),
        'pushedAt': details.get('pushed_at'),
        'trafficAvailable': traffic_available,
        'views14d': int(views.get('count', 0)) if traffic_available else None,
        'uniqueVisitors14d': int(views.get('uniques', 0)) if traffic_available else None,
        'clones14d': int(clones.get('count', 0)) if traffic_available else None,
        'uniqueCloners14d': int(clones.get('uniques', 0)) if traffic_available else None,
        'dailyViews': views.get('views', []) if traffic_available else [],
        'dailyCommits': daily_commits,
        'event': os.environ.get('EVENT_NAME', 'manual'),
        'branch': os.environ.get('WORKFLOW_REF', ''),
    }
    METRICS_DIR.mkdir(parents=True, exist_ok=True)
    history = load_json(HISTORY, [])
    if not isinstance(history, list): history = []
    history.append(record)
    history = history[-90:]
    CURRENT.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    HISTORY.write_text(json.dumps(history, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    readme = README.read_text(encoding='utf-8')
    start_marker, end_marker = '<!-- GITHUB_METRICS_START -->', '<!-- GITHUB_METRICS_END -->'
    section = start_marker + '\n' + build_section(record, history) + end_marker
    if start_marker in readme and end_marker in readme:
        left, remainder = readme.split(start_marker, 1)
        _, right = remainder.split(end_marker, 1)
        updated = left + section + right
    else:
        updated = readme.rstrip() + '\n\n## GitHub repository metrics (auto-updated)\n\n' + section + '\n'
    README.write_text(updated, encoding='utf-8')
    print(f"Updated metrics for {record['repository']} at {record['timestamp']}; traffic_available={traffic_available}; history={len(history)}")


if __name__ == '__main__':
    main()

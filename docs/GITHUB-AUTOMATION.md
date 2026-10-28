# GitHub command, statistics and automatic documentation

**Date:** 25 October 2026.

## WhatsApp commands

The plugin `src/plugins/tools/github.js` defines these commands:

| Command | Output |
|---|---|
| `.github` / `.githubstats` | Repository metadata and optional traffic totals |
| `.github commits` | Up to five latest commits |
| `.github issues` | Up to eight open issue entries (pull requests filtered out) |
| `.github workflows` | Up to six recent GitHub Actions runs |

Required bot config:

```env
WHISKAY_GITHUB_REPO=owner/whiskay-bot
WHISKAY_GITHUB_TOKEN=
WHISKAY_GITHUB_TRAFFIC_TOKEN=
```

`WHISKAY_GITHUB_REPO` must name the real repository in `owner/repo` format. `WHISKAY_GITHUB_TOKEN` is optional for public metadata but can help with rate limits/private repository access. `WHISKAY_GITHUB_TRAFFIC_TOKEN` is optional and is required for the privileged traffic endpoint. Use a fine-grained token with repository access and **Administration: Read** permission for traffic endpoints; keep it only in `.env` or repository secrets. Reference: [GitHub REST repository traffic API](https://docs.github.com/en/rest/metrics/traffic).

## Metrics workflow

`.github/workflows/github-metrics.yml` is scheduled every six hours, can be started with `workflow_dispatch`, and also runs on relevant source pushes. `.github/scripts/update_github_metrics.py` calls the GitHub REST API, stores a current snapshot in `docs/metrics/github-metrics.json`, appends a bounded history in `docs/metrics/history.json`, generates Mermaid charts, and updates only the section between `<!-- GITHUB_METRICS_START -->` and `<!-- GITHUB_METRICS_END -->` in the root README. Generated commits use `[skip ci]` and `GITHUB_TOKEN` to avoid an update loop.

To enable traffic data, create the Actions secret `WHISKAY_GITHUB_TRAFFIC_TOKEN` at repository Settings → Secrets and variables → Actions. The workflow still reports public metadata if this secret is absent, but explicitly displays traffic as unavailable.

## What “visitor count” means

GitHub's traffic endpoint returns view and clone totals broken down over **the last 14 days**. This is not a lifetime visitor count and is not an analytics counter for everyone who reads the README offline. The traffic endpoint is available only to users/tokens with suitable repository access, as described by GitHub. Traffic data is not fabricated if permission is missing.

- Public repository metadata (stars, forks, open issues, last push): `GET /repos/{owner}/{repo}`.
- Page views and unique visitors: `GET /repos/{owner}/{repo}/traffic/views`.
- Clones and unique cloners: `GET /repos/{owner}/{repo}/traffic/clones`.
- Workflow run summaries: `GET /repos/{owner}/{repo}/actions/runs`.

The existing `.github/workflows/repo-update-history.yml` is preserved. It appends source-update metadata to `docs/history/updates.jsonl` after eligible pushes; that log describes code updates and is separate from website analytics or repository traffic metrics.

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

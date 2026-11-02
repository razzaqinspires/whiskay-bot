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

## Metrics workflow — read-only

`.github/workflows/github-metrics.yml` runs on its schedule, manual dispatch, and relevant pushes to `main`. It may calculate metrics in the ephemeral Actions workspace, but its permission is `contents: read` and it has no commit/push step. README metrics therefore do not auto-update in the repository; refresh or commit a reviewed snapshot manually when desired.

The `repo-update-history.yml` workflow is also read-only. It can create a temporary history entry during the job, but it does not append that change to the repository. This deliberately retires the legacy bot writers that previously advanced `main` after each human push.

The sole GitHub automation writer is `automation-autopilot.yml`, which checks out human-owned `main` read-only and writes generated automation state only to the bot-owned `automation` branch. The human `git upload` route publishes source changes only to `upload/*` and opens a reviewed Pull Request; it never writes directly to `main`.

## What “visitor count” means

GitHub's traffic endpoint returns view and clone totals broken down over **the last 14 days**. This is not a lifetime visitor count and is not an analytics counter for everyone who reads the README offline. The traffic endpoint is available only to users/tokens with suitable repository access, as described by GitHub. Traffic data is not fabricated if permission is missing.

- Public repository metadata (stars, forks, open issues, last push): `GET /repos/{owner}/{repo}`.
- Page views and unique visitors: `GET /repos/{owner}/{repo}/traffic/views`.
- Clones and unique cloners: `GET /repos/{owner}/{repo}/traffic/clones`.
- Workflow run summaries: `GET /repos/{owner}/{repo}/actions/runs`.

The existing `.github/workflows/repo-update-history.yml` is retained as a read-only workflow. It does not commit or push the generated ledger; see [GitHub automation isolation](GITHUB-AUTOMATION-ISOLATION.md).

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

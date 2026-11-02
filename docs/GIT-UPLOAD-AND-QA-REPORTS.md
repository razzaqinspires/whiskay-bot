# Git Upload Pipeline & ZIP QA Reports

**Updated:** 1 November 2026 · Stage 53  
**Repository:** `razzaqinspires/whiskay-bot`

## Standard entrypoints

- `scripts/git-upload.sh`: orchestrates detect, protection, npm install, QA, report, branch creation and push.
- `scripts/auto-push.sh`: guarded analyze/QA/publish primitives. Publishing is restricted to `upload/*`; direct pushes to `main` are rejected.
- `scripts/git-upload-report.mjs`: creates a redacted Markdown report and full local diagnostic ZIP.
- `scripts/protect-runtime-data.mjs`: untracks private files without deleting local bytes.

## Normal upload

```bash
npm run fix:git-upload
git upload
```

Run the command from the configured integration branch (`main` by default); other branches and detached HEADs are rejected to prevent accidentally publishing bot-maintenance branches. A normal upload always runs `npm ci --no-audit --no-fund`, a syntax scan and the complete `npm test` suite. It retries transient npm registry/DNS failures once using cache preference. `--skip-install` is available only as an explicit operator override.

QA failures are not discarded. The script writes a redacted report, creates a timestamped commit, and submits an `upload/*` branch so GitHub can run a second validation and open an Issue with detailed failures. Secrets, databases and sessions are hard-blocked and never bypassed.

## GitHub flow

1. The local script pushes only `upload/YYYYMMDD-HHMMSS-NNNN`.
2. `.github/workflows/upload-branch-pr.yml` opens or updates a PR to `main`.
3. The workflow performs a clean dependency installation, syntax scan and regression suite.
4. Full logs and ZIP reports are uploaded as workflow artifacts.
5. Any local or remote validation failure creates/updates a detailed GitHub Issue and comments on the PR.
6. PR merge remains a reviewed action; the bot never auto-merges into `main`.

The independent autopilot remains isolated to `automation`. Its branch is not used for source releases.

## Data and session protection

Every `data/`, `sessions/`, and `session/` directory is ignored at any depth. Baileys/WhatsApp Web authentication directories, SQLite sidecars, common credential JSON exports, certificates and private keys are also excluded. Legacy tracked paths are removed from Git index in bounded batches while local bytes remain in place. Static dungeon source data lives at `assets/dungeon/floors.json`; no data file is exempted from the `data/` exclusion. `.env.example` at the repository root is the only environment template intended for GitHub. If a secret/data hard-block stops publishing, the uploader still creates a redacted local diagnostic Markdown/ZIP but does not send it to GitHub.

**Historical caveat:** removing a file from the current Git tree does not remove it from earlier commits. Rotate any previously exposed credential. Historical cleanup requires a separate coordinated Git history rewrite.

## Report locations

- Local Markdown: `docs/reports/git-upload/<run-id>.md`, committed to the upload branch.
- Local ZIP: `data/test-reports/git-upload-<run-id>.zip`, ignored by Git.
- GitHub artifact: `whiskay-upload-<run-id>-<attempt>`, retained for 30 days.

See [`STAGE-53-GITHUB-SAFE-UPLOAD.md`](STAGE-53-GITHUB-SAFE-UPLOAD.md) for full design and verification details.

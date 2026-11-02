# Scripts directory

Semua shell entrypoint dan utility operasional Whiskay berada di direktori ini. Jangan mengembalikan file `*.sh` ke root.

## Git upload pipeline (Stage 53)

- `git-upload.sh` — one-command orchestrator (`git upload`): fetch/detect, runtime protection, clean `npm ci`, syntax scan, full `npm test`, report/ZIP generation, upload branch, and GitHub Actions handoff.
- `auto-push.sh` — analyze/QA/publish primitives. Publishing is allowed only from `upload/*`; it never pushes to `main`.
- `git-upload-report.mjs` — writes a redacted, timestamped Markdown report and a full local ZIP under ignored `data/test-reports/`.
- `protect-runtime-data.mjs` — removes legacy tracked `data/`, `sessions/`, `session/`, WhatsApp auth, `.env`, database sidecars and credential exports from the Git index in bounded batches without deleting local copies.
- `install-git-upload-alias.sh` — configures the repository-local `git upload` alias.
- `archive-test-log.mjs`, `run-tests.mjs`, `testcommand-runner.mjs` — test execution and diagnostic archive helpers.

## Usage

```bash
# Install/repair `git upload` alias once
npm run fix:git-upload

# Run only from main (or WHISKAY_GITHUB_BASE_BRANCH): npm ci -> syntax -> npm test -> report -> branch push -> PR automation
git upload

# Full validation, but no branch/commit/push
git upload --dry-run

# Only when intentionally reusing an already locked, installed dependency tree
git upload --skip-install

# Explicit commit message (the default includes Jakarta date/time)
git upload --message="chore: describe the update"
```

`npm ci` runs by default on every normal upload. The pipeline retries transient registry/DNS failures once with npm cache preference. Syntax/test failure does not discard diagnostics: the branch is still submitted for review, and GitHub Actions creates a detailed Issue. Private data/secret detection is a hard blocker and cannot be bypassed by a failed QA run.

## GitHub branch policy

- `main`: protected integration branch. The local upload process never pushes here.
- `upload/YYYYMMDD-HHMMSS-NNNN`: generated branch for each upload.
- `.github/workflows/upload-branch-pr.yml`: opens/updates a PR to `main`, reruns CI, uploads logs and test ZIPs as workflow artifacts, and creates/updates a GitHub Issue on failure.
- `.github/workflows/automation-autopilot.yml`: separate automation writer, restricted to branch `automation`.

## Private data rules

Every `data/`, `sessions/`, and `session/` directory is private and ignored, along with Baileys/WhatsApp Web auth folders, common credential exports and database sidecars, including nested paths such as `data/jadibot/sessions/`. The static dungeon floor definition is in `assets/dungeon/floors.json`. Tracked legacy files are removed from the index using `git rm --cached`; local bytes are preserved. Never copy `.env`, WhatsApp credentials, databases, backups, logs or sessions into a release ZIP.

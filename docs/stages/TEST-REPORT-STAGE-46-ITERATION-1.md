# Stage 46 Iteration 1 — Test Report

**Release:** v2.35.0  
**Scope:** detached startup daemon, one-instance locking, Cloudflared path/error recovery, `.env` schema/editor/hot reload, owner contact metadata, and the review-first GitHub push control center.

## Focused results

| Test group | Result |
|---|---:|
| Stage 46 startup/config/GitHub-control tests | **10/10 passed** |
| Stage 42 Cloudflared resolver regression | **2/2 passed** |
| Stage 43 leveling + Canvas regression | **6/6 passed** |
| Stage 45 energy intelligence regression | **10/10 passed** |
| Stage 44 quiz/serializer focused file | **7/7 passed** |
| Full Stage 44 combined script | **7/8 passed** (one environment failure; see below) |
| JS/MJS/CJS syntax scan | **257 files, 0 syntax errors** |
| `bash -n scripts/auto-push.sh` | **Passed** |
| package.json / package-lock version consistency | **Passed: 2.35.0** |
| ZIP integrity | Passed on the final release archive |

## What the tests cover

- `npm start` routes through `scripts/daemon.mjs`, detached process launch, PID/launch locks, and visible `uname -m`, `which cloudflared`, and two ARM64 `ls -lah` checks.
- The startup bootstrap resolves project-relative Cloudflared paths and has a single-instance lock. Cloudflared's asynchronous `spawn` error clears the stale child reference so retries can recover.
- All 90 editable `.env` schema keys across nine categories are present in `.env.example`; downloader endpoints and other secrets are classified and masked. The `OWNER_NAME` contact vCard uses the environment name.
- `.config` category pages expose keys beyond the first ten; secret values are only entered through a private prompt reply.
- `.gitpush` includes analysis, QA, and separate confirmation, with approval bound to owner sender/chat.
- `scripts/auto-push.sh` is tested against a temporary local bare Git remote: analysis emits a content fingerprint and a matching approval pushes to `origin/main`. Stale approval is rejected.
- The replacement shell script contains no `git reset --hard`, `git stash push`, or `git pull --rebase` operations.

## Environment-limited result

`npm run verify:stage44` runs both the Stage 44 quiz/serializer tests and a Stage 41 game-transplant test. The Stage 44-specific file passes **7/7**, but the combined command reports **7/8** because `test/stage41-game-transplant.test.js` imports `src/config/index.js`, and this extracted workspace has no installed `node_modules` (`ERR_MODULE_NOT_FOUND: dotenv`). This is a dependency-installation limitation in the test workspace, not a test assertion failure. Run `npm ci` before full verification on the deployment host.

The full `npm test` suite was not run in this workspace because dependencies are not installed. The background daemon's live start/stop lifecycle was statically checked and syntax-checked, but could not be exercised end-to-end without `dotenv` and the runtime dependencies.

## Not verified on the deployment host

- Actual Cloudflared binary presence, executable permission and architecture compatibility. `npm start` now prints the requested host diagnostics; the correct ARM64 binary must still exist in `data/bin/`, `bin/`, or PATH (or be selected with `CLOUDFLARED_BIN`).
- Actual Baileys session startup and WhatsApp button/list rendering/selection.
- Production GitHub credentials, actual `origin/main` push, and current CI workflow behavior.
- Any deployment-specific `.env` secret or WhatsApp owner number. `.env.example` deliberately leaves these blank.

A passing test is not a claim that production WhatsApp, Cloudflare or GitHub connectivity has been verified.

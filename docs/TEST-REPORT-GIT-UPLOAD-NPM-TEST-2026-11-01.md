# Test report — Git upload safety and npm test ZIP reports

**Date:** 1 November 2026  
**Repository:** `razzaqinspires/whiskay-bot`  
**Scope:** Relocate shell entrypoints into `scripts/`, restore deterministic dependency QA, make `npm test` produce detailed ZIP reports, preserve the human-main/bot-automation branch boundary, and restore the chess/workload regressions supplied in the implementation brief.

## Implemented changes

- Moved the two root-level shell entrypoints found in the supplied archive (`auto-push.sh` and `git-upload.sh`) into `scripts/`. No `autofix-tests.sh` or `run-all-fixes.sh` existed in that archive, so there were no such files to move.
- Updated `package.json`, `src/plugins/owner/github-push.js`, `test/stage46-github-push.test.js`, the alias installer, README and implementation documentation to use `scripts/` paths.
- Added a dependency freshness check to `scripts/auto-push.sh --qa`. It runs `npm ci --no-audit --no-fund` when `node_modules/` is absent, the npm internal lock is absent, or `package-lock.json` is newer than `node_modules/.package-lock.json`. Otherwise it reuses the installed tree. QA never calls `npm install`.
- Kept `scripts/git-upload.sh --dry-run` in the same ANALYZE → QA order and verified that the early exit occurs only after QA. A fixture-based integration test stubs npm, confirms the `npm ci` call, runs a real Node test report, and verifies that no local commit or remote push occurs.
- Updated the test runner to emit one ZIP per `npm test` invocation under `data/test-reports/`. Each report includes metadata, test-file inventory, event JSONL, failures JSON/Markdown, source excerpts, and redacted logs. Dependency-install failures are packed into a separate ZIP before QA aborts.
- Kept `.env.example` populated with the default `AI_SYSTEM_PROMPT` and added the missing `JADIBOT_LAST_TRYCLOUDFLARE_URL` placeholder to match the 95-key environment settings map.
- Preserved the `WorkloadCortex` energy-mode spacing, set the empty/unclassified workload cooldown multiplier to 2.5, and set the CRITICAL workload shard threshold to 75.
- Added outsider warning/lockout behavior and a pseudo-legal move guard to the chess plugin.
- Kept `github-metrics.yml` and `repo-update-history.yml` at `contents: read` without repository commit/push steps. The autopilot remains the only workflow writer and targets `automation`.

## Verification results

| Check | Result |
|---|---:|
| JavaScript syntax scan over `src/`, `scripts/`, and `test/` | 296 files passed, 0 syntax errors |
| Bash syntax scan | 3 scripts passed, 0 syntax errors |
| Focused regression / Git safety tests | 38 passed (includes temporary bare-remote push tests and mocked dry-run QA) |
| Full `npm test` in this environment | 353 passed, 30 failed, 0 skipped; 383 tests across 89 files |

## Full-suite limitation

At the time of this report, the full-suite ZIP and dependency-install diagnostic ZIP were stored in `data/test-reports/`. Those generated local outputs were intentionally removed during Stage 52 repository cleanup; this Markdown report remains as the historical result record.

The full-suite result is **not a green QA result**. `npm ci --no-audit --no-fund` could not complete because the environment could not resolve `registry.npmjs.org` (`EAI_AGAIN`). The resulting missing `dotenv/config` dependency accounts for all 30 reported failures, including subprocess tests that load `src/config/index.js`. The dependency failure log is in a separate `npm-ci-failure-*.zip`; the complete test failure report is `npm-test-*-fail.zip` in `data/test-reports/`.

The archive supplied for this task does not contain `.git` metadata or an authenticated GitHub remote. The upload pipeline was exercised against temporary local bare repositories, including proof that dry-run does not commit or push. No real GitHub push was attempted.

## Re-run on a connected machine

From the root of a real clone, run:

```bash
npm ci --no-audit --no-fund
npm test
bash scripts/git-upload.sh --dry-run
```

The latest `npm test` report will be identified by `data/test-reports/LATEST.txt`. Attach the ZIP file itself when sharing the results for further debugging.

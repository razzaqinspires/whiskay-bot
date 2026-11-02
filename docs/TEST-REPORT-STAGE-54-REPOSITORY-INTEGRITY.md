# Stage 54 — Repository Integrity & Secret-Scanner False Positive

Date: 2026-11-02
Version: 2.35.17

## Incident

The Stage 53 upload preflight blocked the upload because `docs/archive/patches/whiskay-local-fix-1.patch` contained synthetic API-key-like strings in a historical test patch. The broad secret pattern correctly failed closed, but it treated the archived patch as an upload candidate. This prevented the Stage 53 commit from reaching GitHub.

## Resolution

- Historical patch files in `docs/archive/patches/*.patch` are now local-only and ignored by Git.
- `scripts/protect-runtime-data.mjs` treats the patch archive as private/local-only and removes already tracked patch files from the index without deleting local bytes.
- `scripts/auto-push.sh` excludes those local-only paths from candidate secret scanning.
- The known synthetic patch remains in the historical archive for traceability, but `.gitignore` and both upload guards classify it as local-only. It is not staged or uploaded.
- Added `scripts/repository-integrity.mjs` to detect unresolved relative imports and package/package-lock version drift.

## Validation

- Repository integrity: PASS
- Source files scanned: 302
- Relative imports checked: 397
- Missing relative imports: 0
- package-lock consistency: PASS
- Stage 54 tests: 3/3 PASS
- Shell syntax checks: PASS

## Important upload note

This report documents a local source-package repair. It does not claim that a GitHub push or pull request has happened. The local repository must run `git upload` after applying this package. Upload remains branch-only (`upload/*`) and uses a pull request; it never pushes directly to `main`.

## Full-suite attempt in the packaging environment

`node scripts/run-tests.mjs` was executed without an installed `node_modules` tree. Result: 370/400 assertions passed, 30 failed. The captured failure details show missing runtime dependencies such as `dotenv` (`ERR_MODULE_NOT_FOUND`), so this run is dependency-blocked and is not evidence of 30 confirmed source regressions. Re-run after a successful `npm ci` in the user's Termux/server environment. The full diagnostic bundle is intentionally not included because it belongs under the ignored local `data/test-reports/` directory.

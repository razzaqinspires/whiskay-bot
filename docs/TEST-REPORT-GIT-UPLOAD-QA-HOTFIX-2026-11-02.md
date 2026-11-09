# Git Upload QA & Supply-Chain Hotfix — 2026-11-02

## Confirmed root causes

1. `scripts/git-upload.sh` calls both `git-upload-intelligence.mjs` and `git-upload-recovery.mjs`. Neither was copied into the two disposable fixtures in `test/git-upload-permission.test.js`.
2. `scripts/auto-push.sh` calls `git-upload-intelligence.mjs`; the Stage 46 fixture copied `auto-push.sh` and `protect-runtime-data.mjs` but omitted that module.
3. The GitHub branch tree retained obsolete root `ecosystem.config.cjs` and `env.example`, plus four `.pre-*` files under `src/`, despite the Stage 52 structure contract. The new cleanup helper verifies their exact blob SHA before removing them and preserves modified local work for review.
4. The Stage 52 tests required a historical patch file and an empty QA-report runtime folder. Stage 54 made the patch local-only; the operator's ZIP reports are also local-only and must be preserved. The tests now validate ignore/index state instead of requiring these local files to be absent.
5. Git Upload's summary parser did not recognize the compact line emitted by `scripts/run-tests.mjs`, and its failure-line extractor ignored `[FAIL]`. The report copied the nested test ZIP but did not read `failures.md` from it.
6. The lockfile reported `cacheable@2.5.1` and `@cacheable/utils@2.5.1`, which GitHub identifies as malicious. Their lockfile tarball/integrity metadata already matched the unaffected 2.5.0 releases; the version fields and root npm overrides are now aligned to 2.5.0.

## Changes

- Fixed all disposable Git Upload and Stage 46 fixtures.
- Updated Stage 52 so it never requires or deletes previously generated `data/test-reports/` files; it checks only that the directory is ignored and not tracked.
- Added the exact-match cleanup helper for the six known obsolete blobs. It does not run `git reset`, `git clean`, `git stash`, rebase, force-push or delete unrelated files.
- Set `scripts/git-upload.sh` executable and made both Git upload launchers non-interactive and pager-safe. The dry-run path skips only Stage 57's publish-only empty-PR check, but still executes the complete QA/report path and exits before any commit or push.
- Added compact summary parsing, `[FAIL]` extraction, nested ZIP `failures.md` extraction and npm audit log retention.
- Added regression tests for the reporter and supply-chain lockfile.
- Enforced `npm audit --audit-level=high` in the GitHub CI workflow.

## Verification performed here

- Exact GitHub Advisory Database entries were checked for both package releases. They identify exact version `2.5.1` as malware; the advisories list no patched release. Version `2.5.0` is not listed as affected, and public lockfiles independently show the same 2.5.0 tarball URLs/integrity hashes used here.
- The supplied `whiskay-source-review.zip` is a partial archive, not a full repository snapshot. For focused validation only, omitted source/assets/docs and the real upload-branch workflow were restored into the temporary workspace from the previously supplied Stage 57 release archive; existing uploaded source files were not overwritten, and validation-only files are excluded from the patch ZIP.
- **Focused regression set: 60/60 passed** across Git Upload launcher/fixtures, Stage 46 push fixtures, Stage 52–57 checks, nested-ZIP reporting, dependency lock/CI assertions, npm-test report generation, test discovery, and testcommand reporter/runner regressions. This is a targeted set, not the complete suite.
- No claim is made that `npm ci`, `npm audit`, the full 444-test suite, GitHub Actions, or live WhatsApp was verified after these changes.
- Apply `scripts/apply-git-upload-qa-hotfix.sh` in the actual repository, resolve any `REVIEW_REQUIRED` items, then run focused tests and a clean-runner full QA before merging.

## Required release gate

Do not merge PR #2 and do not start Stage 58 until a clean GitHub Actions run shows `npm ci`, high/critical audit, syntax check and the complete `npm test` suite passing. If the compromised releases were installed on a host, rotate credentials accessible to that host from a separate clean device; deleting `node_modules` alone does not establish that the host is clean.

## Security advisories

- https://github.com/advisories/GHSA-jpjx-r3gh-v5pf
- https://github.com/advisories/GHSA-8v3r-r9vg-5r66

# Git Upload Whitespace Hotfix — v2.35.21

## Trigger

The user's `git upload` run stopped during `SECURE LOCAL SNAPSHOT` because `git diff --cached --check` found three formatting defects:

1. `src/plugins/general/adzan.js:248` — trailing space after the final comma in the interactive status payload.
2. `test/stage48-teamdrop-relay.test.js:30` — an extra blank line at EOF.
3. `vendor/razzaq-adzan-engine/src/prayer-times.mjs:178` — an extra blank line at EOF.

## Changes

- Removed only the trailing space from the Adzan source line.
- Normalized the two EOFs to exactly one terminating newline.
- Added `test/upload-whitespace-hotfix.test.js` to guard all three exact paths.
- Added `npm run verify:upload-whitespace` and included it in `verify:all`.
- Updated the Stage 57 release metadata test to validate semantic-version format instead of pinning `2.35.20`.
- Bumped package metadata consistently to `2.35.21`.

## Validation

- Stage 53 tests: 6/6 passed.
- Stage 57 tests: 5/5 passed.
- Whitespace hotfix test: 1/1 passed.
- Combined focused tests: 12/12 passed.
- Direct whitespace scan of all three reported files: PASS.
- `bash -n scripts/auto-push.sh scripts/git-upload.sh`: PASS.
- package.json/package-lock.json version consistency: PASS.

The strict staged `git diff --check` gate remains enabled. No broad bypass, force push, reset, or destructive cleanup was introduced. Full `npm test` and live remote upload were not run in this packaging environment.

# Test report — Stage 50 Leveling Data Integrity

Date: 2026-10-31
Package: Whiskay Bot v2.35.5

## Focused test execution

Command:

```bash
node --test test/stage35-core.test.js test/stage43-leveling-storage.test.js test/protect-leveling-data.test.js test/stage46-github-push.test.js
```

Result:

- 15 tests passed
- 0 tests failed
- 0 tests skipped

Coverage included:

- Stage 35 command XP award remains functional with a dedicated temporary data directory.
- Existing leveling profile survives process restart.
- Corrupt primary can recover from the last valid backup.
- Archive generation and checksum-backed archive recovery.
- Backup write failure aborts save and preserves the previous primary XP/level/coin.
- Manual backup restore quarantines the corrupt primary before restoring.
- Tracked runtime `data/` files are removed from the Git index without deleting local files; static dungeon floors remain tracked.

## Supplementary verification

`npm run verify:stage43` passed: 8/8 tests, including the Canvas V1/V2 render and upload-flow checks plus the leveling storage regressions.

## Static checks

`node --check` passed for all 283 JavaScript files under `src/`, `scripts/`, and `test/`; `bash -n scripts/auto-push.sh` also passed. `package.json` and `package-lock.json` parse as valid JSON.

## Not run / not claimed

- Full `npm test` / `npm run verify:all`: not run in the packaging container because `node_modules` is not included in the source archive.
- Live WhatsApp messages, production bot restart, and production database recovery: not run.
- No production XP database was modified by this packaging work.

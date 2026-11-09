# Test Report — Stage 60 Data Integrity & Core Stability Recovery

**Release:** v2.35.25 · **Date:** 2026-11-08

## Focused Stage 60 tests

Command:

```bash
node --test test/stage60-data-integrity.test.js
```

Result: **11 passed / 11 total / 0 failed / 0 skipped**.

Coverage:

1. Corrupt Energy ledger blocks mutation and original bytes remain unchanged.
2. A fresh installation reports a missing primary/backup as `missing`, not corruption.
3. A valid prior ledger is preserved as `energy-ledger.json.bak`.
4. Explicit restore preserves the corrupt primary in a unique pre-restore archive.
5. Twelve independent Node processes update one shared ledger without lost updates.
6. Ten concurrent debit processes cannot spend more than the available balance.
7. Two independent processes racing the same webhook claim produce exactly one winner.
8. Corrupt webhook idempotency JSON blocks the claim rather than allowing an untracked send.
9. Debit during an active charge session rebases the charge schedule and cannot restore the debited energy on a later read.
10. Full batteries do not cause repeated passive-regeneration ledger rewrites.
11. Plugin command, alias and command-vs-alias conflicts resolve deterministically and are reported.

## Cross-stage regression

The combined regression set covers energy-worker, Stage 20 passive regeneration, Stage 45 energy features, Stage 49 WorkloadScheduler, Stage 52 repository structure, Stages 53–57 Git operations, Stage 58 outbound guard, Stage 59 threat agent, Stage 60 data integrity, Stage 55 plugin audit and TEAMDROP source contract. Result: **80 passed / 80 total / 0 failed / 0 skipped**. The prior final verdict already carried 80/80; the subsection count was a documentation typo and is corrected here based on the rerun of the exact listed test set.

## Syntax and repository audit

`node --check` passed for **320 JavaScript/MJS/CJS files**.

```text
Repository integrity: PASS
Source files scanned: 321
Relative imports checked: 423
Missing relative imports: 0
package-lock consistency: PASS
```

## Full suite attempt

Command:

```bash
npm test
```

Latest full-suite result: **418 passed / 448 total / 30 failed / 0 skipped**. The TEAMDROP regression assertion was updated to verify persistent claims/completion and passes in the focused cross-stage run.

Dependency installation was attempted:

```bash
npm ci --ignore-scripts --no-audit --no-fund
```

It timed out in this environment and left an incomplete dependency tree. The full report ZIP created by the test harness is intentionally not included in this source release because it contains environment-specific logs and temporary test diagnostics. Its path during this run was:

```text
data/test-reports/npm-test-20261108065348-7bb42bf0-fail.zip
```

The failure archive lists 25 direct `dotenv/config` module-resolution errors and five generic top-level `test failed` wrappers whose underlying child-process errors were not surfaced. Those five remain unclassified. The full suite has not been rerun with dependencies installed, so no full-suite PASS is claimed.

## Not tested

- Live WhatsApp account and Baileys delivery.
- Real TEAMDROP/World Boss webhook provider retries.
- PM2 multi-instance deployment. The supplied PM2 config remains one fork instance; lock tests use independent local Node processes.
- Cross-host or network filesystem locking.

## Verdict

**Stage 60 focused tests PASS (11/11). Combined cross-stage tests PASS (80/80). Repository integrity PASS. Full npm test remains BLOCKED/FAIL (418/448) due incomplete dependencies; 25 missing-`dotenv/config` failures and five unclassified wrappers remain.** Live production readiness is not established.

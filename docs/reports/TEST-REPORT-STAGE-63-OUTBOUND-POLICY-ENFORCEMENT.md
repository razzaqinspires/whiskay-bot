# Stage 63 — QA Report

Release: `2.35.28` | Part 6 | Date: 2026-11-09

## Focused results

| Check | Result |
|---|---:|
| `node --check` for all JS/MJS/CJS files under `src/`, `test/`, `scripts/`, and `config/` | PASS — 325 files |
| `npm run audit:repository` | PASS — 436 relative imports, 0 missing; package-lock consistency PASS |
| `npm run verify:ops` | PASS — 8/8 |
| Stage 63 outbound policy suite | PASS — 8/8 |
| Stage 58–61 outbound/data-integrity regression | PASS — 38/38 |
| `npm run verify:outbound-stability` (Stages 58–61 and 63) | PASS — 46/46 |
| Stage 62 lifecycle suite (isolated loader harness; stubs only unavailable `pino`/`dotenv` imports) | PASS — 8/8 |
| `package.json` / `package-lock.json` version alignment | PASS — `2.35.28` |
| ZIP archive integrity | PASS — verified after release assembly |
| Full `npm test` | NOT RUN — dependency install incomplete |
| Full `npm run verify:all` | NOT RUN — dependency install incomplete |
| Live Baileys account / production session | NOT RUN |

## Stage 63 coverage

1. Global rolling limit is rechecked immediately before transport.
2. Per-recipient rolling limit is rechecked immediately before transport.
3. A queued reservation older than 120 seconds is rejected instead of sent later.
4. Binary media fingerprints use byte content and do not collapse unknown media into type-only duplicates.
5. Baileys media fingerprint ignores volatile encryption and path metadata while keeping stable file identity.
6. Missing and placeholder source labels are rejected before transport.
7. Explicit AsyncLocalStorage source context reaches the final send guard.
8. JobLoader assigns a stable `schedule:<job-name>` source label to scheduled outbound work.

## Stage 62 follow-up coverage

Eight isolated lifecycle tests passed. They cover cancellation while waiting for pacing, queued cancellation and lane pruning, pump-aware idle detection, Chronos bounded concurrency, running-map registration before callback invocation, single-flight ticks, pause/resume, graceful stop, and ReloadQueue closure.

The isolated harness was used because the default test process cannot import the absent `pino`/`dotenv` packages from the incomplete `node_modules` tree. The shim only resolves those unavailable imports; it is not equivalent to a clean installation or a full runtime integration test.

## Cross-stage regression

Stages 58–61 passed 38/38. An initial run produced 37/38 because a historical assertion hardcoded version `2.35.26`; the assertion was corrected to verify `package.json` and `package-lock.json` stay aligned while retaining Stage 61 release lineage. The rerun passed 38/38.

## Dependency and environment limitations

`npm ci --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=30000` could not restore the complete dependency tree. The npm process reported `Exit handler never called`; the associated log also contained `EAI_AGAIN` while attempting to reach `registry.npmjs.org`. As a result, full `npm test` and `npm run verify:all` were not executed. This report does not claim a full-suite pass.

No production WhatsApp session was opened, no live send was attempted, and no claims are made about provider-level delivery behavior or account safety. The final-boundary concurrency properties are covered by deterministic store tests, including the existing Stage 61 multi-process checks.

## Release gate

The focused code tests and repository checks are green, but deployment should still run a clean `npm ci`, `npm run verify:stage62`, `npm run verify:stage63`, `npm run verify:outbound-stability`, `npm test`, and `npm run verify:all` on a machine with registry access. Review custom background sender paths for explicit source attribution before enabling the bot.

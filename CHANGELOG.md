## v2.35.34 — Part 11 / Stage 68 — Protected Third-Party Library & Adapter Foundation

- Preserved the supplied Westmanga scraper as a byte-verified CommonJS `.cjs` source under `src/lib/external/`.
- Added an adapter/controller for response styles, input validation, provider health, and future explicit fallback providers.
- Excluded protected third-party source from universal source reload, deterministic git repair, and NEXORA AI repair.
- Added Stage 68 regression tests. No WhatsApp command was added; command integration is deferred.

## v2.35.33 — Part 10 / Stage 67 — Authoritative Environment Template & Live Runtime Sync

- Made `.env.example` the authoritative key inventory and added startup/runtime reconciliation for `.env`.
- Missing keys are appended without overwriting existing private values; previously template-managed removed keys are pruned, while user-added keys remain untouched.
- Added atomic writes, owner-only permissions, symlink rejection, local plain-text sync state, debounced watcher and runtime config reload events.
- Added `npm run env:sync` and `npm run verify:stage67`; full aggregate gate includes Stage 67.
- Stage 67 focused tests: 5/5 PASS. Full suite remains unverified because dependency installation timed out in this build workspace.

## v2.35.32 — Part 9 / Stage 66 — Autonomous Git Upload Repair

- Added deterministic trailing-whitespace repair for staged source/config files with private local backups.
- Added opt-in NEXORA AI repair fallback using existing OpenAI/Gemini multi-key configuration.
- AI repairs are limited to staged source/config paths, max three attempts, backed up per attempt, syntax checked and accepted only after `npm test` passes; failed attempts restore originals.
- Upload still refuses to bypass secrets, private-data, conflict, test and branch safety gates. Remote delivery cannot be guaranteed during GitHub/network/auth/protection outages.
- Added Stage 66 tests and documentation.

## v2.35.31 — Part 8 / Stage 65 — Production Readiness & Full QA

- Added dependency, deployment and runtime readiness diagnostics.
- Added JSON health snapshot with Node, dependency, disk, memory and process checks.
- Added isolated corrupt-primary recovery simulation using verified backup and atomic rename.
- Added Stage 65 QA gate to `verify:all`.
- Full suite remains blocked by incomplete dependency installation; see Stage 65 QA report.

## [2.35.29] - Part 7, Stage 64: Service & Webhook Security (2026-11-09)

- Harden TEAMDROP streaming uploads with bounded request handling, private temporary files, strict content-length checks, and file-prefix signature validation without buffering the full document.
- Keep webhook event idempotency persistent and bounded; document its deliberate at-most-once behavior and crash-reconciliation limitation.
- Centralize Jadibot rental/settings persistence with atomic writes, local cross-process locks, valid backup preservation, and fail-closed corruption handling.
- Add lease-aware plugin retirement/disposal; report pending disposers even after timeout and wait within the shutdown budget.
- Protect runtime data from AutoCleaner and enforce a one-hour minimum artifact age.
- Reclaim stale locks only with valid same-host owner metadata and a dead PID; malformed/partial locks fail closed.
- Add `verify:stage64` to `verify:all`; package and lockfile versions are aligned at `2.35.29`.
- QA: Stage 64 focused suite 16/16 passed; Stage 58–61 plus Stage 63 outbound regression 46/46 passed. Stage 62 rerun is blocked by missing `pino`; full `npm test`, `verify:all`, live WhatsApp, Cloudflare, and real external sender tests are not claimed because dependencies are not installed in this workspace.

See `docs/STAGE-64-SERVICE-WEBHOOK-SECURITY.md` and `docs/reports/TEST-REPORT-STAGE-64-SERVICE-WEBHOOK-SECURITY.md`.

# Changelog

## [2.35.30] - Stage 64 Part 2: Universal JavaScript Hot Reload Foundation (2026-11-09)

- Restrict SourceWatcher to `.js` source files across `src/**`, excluding plugins, build/cache/session directories, and all non-JavaScript files.
- Add structured per-file add/change/unlink event batches with coalescing and watcher metrics.
- Add JavaScriptModulePolicy for path normalization, traversal rejection, change classification, and conservative reload planning.
- Restore `sourceReload` from RuntimeState on startup, with `SOURCE_RELOAD` as the initial fallback.
- Make restart syntax preflight check only existing `.js` files; deleted-file events still trigger restart without trying to syntax-check missing paths.
- Keep plugin reload separate. Arbitrary runtime ESM modules still use graceful restart until lifecycle/dependency management is ready for in-process swaps.
- Add `verify:stage64-part2` and include it in `verify:all`; package and lockfile versions aligned at `2.35.30`.

See `docs/STAGE-64-PART2-UNIVERSAL-JAVASCRIPT-HOT-RELOAD.md` and `docs/reports/TEST-REPORT-STAGE-64-PART2-UNIVERSAL-JAVASCRIPT-HOT-RELOAD.md`.


## [2.35.28] - Part 6, Stage 63: Outbound Policy Enforcement (2026-11-09)

- Revalidate source quarantine, global/per-recipient 60-second rolling limits, duplicate windows and reservation age under the shared policy lock immediately before the Baileys transport call.
- Expire stale queued reservations after 120 seconds so delayed jobs cannot be released as a later burst.
- Replace media-type-only duplicate identity with content-aware SHA-256 fingerprints for in-memory binary payloads and stable Baileys file hashes; ignore volatile encryption/path metadata and decline to fingerprint media without stable evidence.
- Require explicit AsyncLocalStorage source attribution for all guarded outbound sends; reject missing or placeholder labels before transport.
- Attribute scheduled jobs, message ingress, built-in schedule checks, group notices, webhook sends, poll handlers and Jadibot expiry notifications.
- Complete Stage 62 follow-up fixes: cancellation wakes scheduler pacing waits, idle detection includes the pump, lanes are pruned, Chronos registers running callbacks before execution, pause drains its current tick, and Bot awaits Chronos stop.
- Add `verify:stage63`, include it in `verify:outbound-stability` and `verify:all`, and keep package/lockfile versions aligned at `2.35.28`.
- QA: Stage 63 focused tests 8/8; Stage 58–61 regression 38/38; Stage 62 isolated lifecycle harness 8/8. Full `npm test`/`verify:all` remain unverified because npm dependency installation was blocked by registry DNS / npm exit-handler failure. Live Baileys behavior was not tested.

See `docs/STAGE-63-OUTBOUND-POLICY-ENFORCEMENT.md` and `docs/reports/TEST-REPORT-STAGE-63-OUTBOUND-POLICY-ENFORCEMENT.md`.


## [2.35.27] - Stage 62: Lifecycle & Shutdown Intelligence

- Fixed `disableWatcher()` so disabling the plugin watcher no longer drops the SourceWatcher reference without stopping it.
- Added idempotent, ordered Bot shutdown with cleanup for plugin/source watchers, AutoCleaner, reload queue, outbound guard, workload telemetry, socket, and group metadata.
- Added graceful `ReloadQueue.close()`; pending coalesced reloads are discarded and new reload requests are rejected after closure.
- Made WorkloadScheduler track jobs waiting for pacing separately, cancel pending-start jobs on close, expose idle waiting, and avoid stranded promises.
- Made Chronos ticks single-flight, execute due jobs concurrently up to configured concurrency, and distinguish temporary pause during reconnect from terminal shutdown.
- Chronos now starts only after Baileys reports `connection: open`, pauses on disconnect, and drains active jobs during shutdown.
- Added Stage 62 lifecycle and shutdown regression tests.
- Full dependency-backed QA remains pending when dependencies are unavailable; do not treat syntax checks as a full-suite pass.

## [2.35.27] - Stage 62: Lifecycle & Shutdown Intelligence

- Fixed watcher lifecycle so plugin watcher disable no longer drops a live SourceWatcher reference.
- Added idempotent ordered Bot shutdown with component-level failure reporting.
- Added graceful close semantics to ReloadQueue and WorkloadScheduler.
- Fixed pending-start job cancellation and added bounded idle waiting.
- Made Chronos single-flight with bounded parallel execution and reconnect-safe pause/resume.
- Delayed Chronos startup until the WhatsApp connection is open.
- Added Stage 62 lifecycle and shutdown regression tests.
- Dependency-backed and live WhatsApp QA remain pending; see Stage 62 QA report.

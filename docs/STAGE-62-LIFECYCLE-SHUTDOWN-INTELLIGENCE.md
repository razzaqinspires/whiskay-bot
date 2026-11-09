# Stage 62 — Lifecycle & Shutdown Intelligence

Introduced: `2.35.27` | Follow-up hardening included in `2.35.28` (Part 6) | Previous: `2.35.26`

## Implemented
- Fixed `Bot.disableWatcher()` so it no longer clears the SourceWatcher reference without stopping it.
- Added idempotent, ordered `Bot.stop()` with component-level error collection and a shutdown report.
- Shutdown disposes plugin/source watchers, stops and drains AutoCleaner, closes ReloadQueue, closes/drains outbound guard, flushes WorkloadTracker, ends the socket, and flushes group metadata.
- Chronos starts only after Baileys reports `connection: open`; it pauses and drains on disconnect and is terminally stopped on process shutdown.
- WorkloadScheduler tracks jobs waiting for pacing separately; close wakes and rejects queued and pending-start work immediately, supports AbortSignal cancellation, prunes empty lanes, and makes bounded `waitForIdle()` include the scheduler pump as well as active, queued, and pending-start work.
- Chronos uses single-flight ticks, bounded parallel execution, reconnect-safe pause/resume, and bounded graceful stop. Job callbacks are deferred until after their running entry is registered, avoiding a re-entrancy race; pause also drains the active tick.
- ReloadQueue supports terminal close and rejects new requests after shutdown.
- AutoCleaner exposes bounded `waitForIdle()`. Bot shutdown awaits terminal Chronos stop rather than firing it without waiting.

## Files
`src/core/Bot.js`, `src/core/WorkloadScheduler.js`, `src/core/ChronosCortex.js`, `src/core/ReloadQueue.js`, `src/core/AutoCleaner.js`, `test/stage62-lifecycle-shutdown.test.js`.

## Operations
No new environment variables. Existing `WHISKAY_WORKER_*` variables remain in use. Chronos does not execute scheduled jobs until the WhatsApp socket is open. During reconnect it pauses; on final shutdown it stops permanently.

## Validation
- `node --check` on all changed runtime modules and Stage 62 test: PASS.
- Direct WorkloadScheduler shutdown simulation: PASS (active job completes, queued job rejects, pending-start tracking returns to zero).
- Follow-up regression checks: immediate pacing-wait cancellation, pump-aware idle state, lane pruning, AbortSignal handling, Chronos running-map registration, and pause/resume are included in the 8/8 isolated suite.
- Stage 62 `node:test` suite: PASS 8/8 in an isolated Node loader harness that stubs only unavailable `pino`/`dotenv` imports; the plain default runner remains BLOCKED because dependencies are not installed (`pino` is missing, imported by Logger via ReloadQueue).
- Full `npm test` and `verify:all`: NOT RUN; do not treat as PASS.
- Live Baileys lifecycle test: NOT RUN; requires an isolated test account and deployed runtime.

## Rollback
Restore the `2.35.26` source package while preserving `.env`, `data/`, database, and Baileys session. Never restore runtime data from a source ZIP.

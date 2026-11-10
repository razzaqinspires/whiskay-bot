# Stage 70.1 — Outbound Delivery Queue & Rate-Limit Deferral

## Baseline
- Previous release: WHISKAY-BOT v2.35.36 (Part 12.1)
- Target release: WHISKAY-BOT v2.35.37 (Part 12.2)
- Baileys dependency remains pinned; no dependency upgrade is included.

## Incident
A `.leaderboard` reply and the subsequent energy notice were rejected with:
`Outbound message blocked by policy: recipient-rate-limit (risk 46/100)`.

The local policy store treated recipient/global rolling-window saturation as a hard rejection during `reserve()`. This happened before the existing `WorkloadScheduler` could serialize the message. As a result, the main reply failed and the error reply / energy notice could be rejected by the same policy.

## Changes
- `src/core/OutboundPolicyStore.js`
  - Rolling rate windows now count only sends that reached the transport boundary (`started` / `sent`), not pending reservations.
  - Recipient/global rate saturation returns an accepted reservation marked `deferred`, rather than dropping the response.
  - `start()` rechecks the rolling window immediately before transport and waits until capacity is released.
  - Duplicate payload suppression remains a hard rejection.
  - Source quarantine and critical threat policy remain hard blocks.
  - Reservation and queue wait TTL are bounded to 10 minutes.
- `src/core/WorkloadTracker.js`
  - `startOutbound()` uses a bounded wait/reservation age controlled by `WHISKAY_OUTBOUND_QUEUE_WAIT_MAX_MS`.
- `src/core/OutboundTrafficGuard.js`
  - Existing scheduler remains the sole send worker.
  - Default queue capacity raised from 50 to 150, still bounded.
  - Per-recipient FIFO lane and global concurrency/minimum interval remain active.
- `test/stage70-outbound-delivery-queue.test.js`
  - Tests recipient deferral, global deferral, duplicate blocking, quarantine blocking, worker dispatch, and unattributed-send rejection.
- `.env.example`
  - Queue maximum defaults to 150.
  - Queue wait maximum defaults to 600000 ms.

## Delivery behavior
A response that hits a local rolling rate limit is not sent immediately and is not rejected at reservation time. It waits in the bounded worker queue until a final transport slot becomes available.

This is not a guarantee that WhatsApp will deliver every message. A disconnected socket, a WhatsApp-side rejection, an account restriction, duplicate suppression, source quarantine, a critical safety pause, or a full/expired local queue can still prevent delivery. The system must not evade WhatsApp anti-spam controls.

## Safety invariants
- No automatic resend after an ambiguous transport failure; the remote server may have accepted the first send.
- Exact duplicate fingerprints remain blocked within the configured duplicate window.
- Source quarantine and critical threat blocks are not bypassed.
- The queue is bounded; it cannot grow indefinitely and exhaust memory.
- Existing outbound source attribution remains mandatory.
- Existing persistent cross-process file-lock reservation remains the shared policy boundary.

## Owner diagnostics
Use `.outboundstatus` to inspect queue depth, active workers, accepted sends, policy blocks, duplicate suppressions, source quarantines, failures, rolling-window limits, and current risk score.

## Configuration
- `WHISKAY_OUTBOUND_WORKERS=2`
- `WHISKAY_OUTBOUND_MIN_INTERVAL_MS=2000`
- `WHISKAY_OUTBOUND_QUEUE_MAX=150`
- `WHISKAY_OUTBOUND_QUEUE_WAIT_MAX_MS=600000`
- `WHISKAY_OUTBOUND_GLOBAL_MAX_PER_MINUTE=20`
- `WHISKAY_OUTBOUND_RECIPIENT_MAX_PER_MINUTE=4`
- `WHISKAY_OUTBOUND_DUPLICATE_WINDOW_MS=30000`

These are conservative local controls, not published WhatsApp limits or a promise of ban prevention.

## Verification
- `npm run verify:stage70-outbound`
- `npm run verify:stage69`
- `npm run verify:stage63`
- `npm run verify:stage61`
- `npm test`
- `npm run verify:all`

Stage 70.1 focused tests: 7/7 pass. Syntax checks for changed files pass. The combined Stage 63/61/58 regression command exceeded the workspace execution window and is not claimed as passed. No live WhatsApp session test was run.

## Rollback
Revert `OutboundPolicyStore.js`, `WorkloadTracker.js`, `OutboundTrafficGuard.js`, test, env template, package scripts/version, README and CHANGELOG to v2.35.36. Do not delete `data/outbound-policy-state.json`; it contains runtime policy history and queue reservations.

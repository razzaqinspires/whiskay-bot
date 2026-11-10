# Stage 63 — Outbound Policy Enforcement at the Transport Boundary

Release: `2.35.28` | Part 6 | Previous: `2.35.27`

## Objective

Stage 63 closes the gap between an outbound reservation and the actual Baileys transport call. Queue delay, a newly applied source quarantine, or other sends that start while a message waits may change the policy decision. The final boundary must therefore re-check the shared policy immediately before `sendMessage`/`relayMessage` is invoked.

## Implemented

### 1. Final-boundary rolling policy

`src/core/OutboundPolicyStore.js` now revalidates the reservation under the existing shared local file lock. Immediately before granting the send slot it rechecks:

- source quarantine and expiry;
- global rolling 60-second send count;
- per-recipient rolling 60-second send count;
- duplicate content within the configured duplicate window;
- reservation age, with a maximum queue reservation age of 120 seconds.

A stale reservation is marked failed instead of being released as a delayed burst after it has aged out of the original window. Other stale queued reservations are also marked failed during the same serialized pass. If a final check blocks a send, the store records the reason and the transport callback is never invoked. The shared lock makes the final decision atomic across Node processes using the same supported local filesystem.

Final-boundary policy outcomes include `source-quarantine-before-send`, `duplicate-payload-final-boundary`, `recipient-rate-limit-final-boundary`, `global-rate-limit-final-boundary`, and `reservation-expired`.

### 2. Content-aware media fingerprints

`src/core/OutboundTrafficGuard.js` exports `messageFingerprint()` and uses stronger content identity:

- `Buffer`, `Uint8Array`, and `ArrayBuffer` payloads are represented by byte length and SHA-256;
- Baileys media with `fileSha256` uses that stable media identity;
- explicit HTTP(S) payload URLs are hashed;
- volatile Baileys transport fields such as `mediaKey`, `directPath`, thumbnail, waveform, timestamps, and participant context are excluded;
- media objects with no stable content evidence return an empty fingerprint rather than collapsing every image/video/document of the same type into one duplicate.

This reduces false-positive duplicate blocks. It does not attempt to download remote URLs or infer media identity from filename, MIME type, or declared size alone. Unsupported media may consequently have no duplicate fingerprint; rate and queue policy still apply.

### 3. Mandatory source attribution

Every guarded outbound operation must execute inside `runWithOutboundContext({ source, command }, callback)` with a non-empty stable source label. Missing labels and placeholder values such as `unattributed` fail closed with `WHISKAY_OUTBOUND_SOURCE_REQUIRED` before a reservation is created or Baileys is called.

Known runtime paths now provide explicit source context:

- command/message ingress: `src/handlers/message.js` and existing command invocation middleware;
- scheduled jobs: `src/core/JobLoader.js` applies `schedule:<job-name>` around each loaded job;
- the built-in group schedule check: `src/core/Bot.js`;
- group welcome/leave notifications and poll handlers in Bot event handlers;
- TEAMDROP and World Boss webhook paths in `src/index.js`;
- Jadibot expiry notifications in `src/plugins/general/jadibot.js`.

Other sends performed by plugins inside a regular command inherit the command's async context. Timer work created from a command inherits its async context where Node's AsyncLocalStorage propagation applies. Independently created background workers must add their own explicit source wrapper.

Example for a new independent worker:

```js
import { runWithOutboundContext } from '../core/OutboundTrafficGuard.js';

await runWithOutboundContext(
  { source: 'worker:invoice-reminder', command: 'invoice-reminder' },
  () => sock.sendMessage(recipient, { text: message })
);
```

Do not use a generic `background` or `unattributed` source as a workaround. Give every worker an identifiable, stable source label.

### 4. Stage 62 shutdown follow-up

The same release completes the remaining Stage 62 lifecycle fixes:

- `WorkloadScheduler` wakes pacing waits immediately when pending work is cancelled, supports AbortSignal cancellation, prunes empty lanes, and includes the pump in `waitForIdle()`;
- `ChronosCortex` registers a running task before invoking its callback, waits for the active tick during pause, and keeps pause distinct from terminal stop;
- `Bot.stop()` awaits terminal Chronos shutdown.

See [`STAGE-62-LIFECYCLE-SHUTDOWN-INTELLIGENCE.md`](STAGE-62-LIFECYCLE-SHUTDOWN-INTELLIGENCE.md) for the Stage 62 addendum.

## Changed files

- `src/core/OutboundPolicyStore.js` — atomic final-boundary rechecks, queued reservation expiry, failure outcomes.
- `src/core/OutboundTrafficGuard.js` — source-attribution enforcement and stable media fingerprints.
- `src/core/WorkloadTracker.js` — final-boundary policy propagation and block counters.
- `src/core/JobLoader.js` — scheduled-job attribution.
- `src/core/Bot.js` — built-in schedule and event-source attribution; await Chronos stop.
- `src/handlers/message.js` — message-ingress attribution.
- `src/plugins/general/jadibot.js` — independent Jadibot expiry source attribution.
- `src/core/WorkloadScheduler.js`, `src/core/ChronosCortex.js` — Stage 62 follow-up fixes.
- `test/stage63-outbound-policy-enforcement.test.js` — Stage 63 regression tests.
- `test/stage62-lifecycle-shutdown.test.js`, `test/stage59-workload-threat-agent.test.js` — Stage 62/lineage regression updates.
- `package.json`, `package-lock.json`, `README.md`, `CHANGELOG.md`, and documents under `docs/` — release metadata, scripts, and records.

## Configuration and operations

No new environment variables are introduced. Existing `WHISKAY_OUTBOUND_*` settings continue to define the configured global/per-recipient ceilings, duplicate window, queue and worker behavior. The final send boundary reuses the same policy limits; it does not create a separate higher budget. Queued reservations have a fixed 120,000 ms maximum age.

`npm run verify:stage63` runs the new focused suite. `npm run verify:outbound-stability` now includes Stages 58–63. `npm run verify:all` includes Stage 63 after Stage 62.

The rate ceilings are local defensive settings, not published WhatsApp limits and not a guarantee against account restrictions. This stage is intended to prevent local bursts, duplicate errors, stale queued sends, unattributed work, and races between local processes. It does not authorize unsolicited messaging or broad broadcast. Existing explicit consent, allowlist, preview, and operator-confirmation rules remain in force.

## Migration

1. Back up the source tree, `.env`, `data/`, and Baileys session directory separately.
2. Deploy the `2.35.28` source package without overwriting runtime data.
3. Keep the existing outbound policy file in `data/`; do not delete or reset it as part of deployment.
4. Run `npm ci` and then `npm run verify:stage62`, `npm run verify:stage63`, and `npm run verify:outbound-stability`.
5. Review custom scripts or independently started background workers. Wrap their outbound calls with `runWithOutboundContext()` and use distinct source labels before enabling them.
6. Start one primary Baileys socket and inspect logs/owner workload diagnostics for `WHISKAY_OUTBOUND_SOURCE_REQUIRED`. A fail-closed rejection indicates an unwrapped sender path that needs attribution, not a reason to disable the guard.

## Rollback

Restore the previous `2.35.27` source package while preserving `.env`, `data/`, the shared outbound policy ledger, databases, and Baileys session. Do not restore the older runtime state from an archive over the current server data. Rolling back the source removes the new final-boundary behavior and source-attribution requirement; use it only as a controlled code rollback, then resolve the unwrapped sender or policy compatibility issue before redeploying.

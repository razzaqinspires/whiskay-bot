# Stage 58 — Outbound Traffic Safety & Command Containment (v2.35.23 · Part 1)

## Scope

This part addresses the highest-risk outbound paths identified in the supplied v2.35.22 archive. It is a containment and observability baseline, not a guarantee against WhatsApp enforcement and not a mechanism to evade platform anti-abuse systems. No live WhatsApp account was connected during this work.

## Incident investigation findings

The source archive does not contain an official WhatsApp enforcement notice, account-quality reason code, server-side delivery logs, or timestamped outbound audit trail. Therefore the historical ban reason cannot be established conclusively. The source does, however, contain several high-risk patterns: 

1. **Original `.bc` broadcast:** the default mode enumerated every group returned by `groupFetchAllParticipating()`. The `--users` mode additionally loaded every registered user. It sent sequential messages to every target with only a 900 ms delay. There was no consent allowlist, target cap, or mandatory preview confirmation. This is a strong potential source of high-volume outbound traffic.
2. **Original `.testcommands`:** the background QA callback emitted WhatsApp interactive messages for each phase start, every syntax-progress event, test discovery, test-progress events, stage completion, and final error/result. Syntax progress is generated while source files are checked, so one QA run could create a large number of outbound messages without a new owner request. This is another strong potential source of message bursts.
3. **Original passive intent route:** ordinary text matching phrases such as “hitung telur” could directly execute the egg calculator plugin without a command prefix. This was an implicit dispatch path and is removed.
4. **Original Nexora private behavior:** `AI_CHAT_MODE` defaulted to a mode that enabled private auto-response for registered users. This could produce replies outside an explicit mention/command interaction. The conservative default is now `mention-only`, and private auto-response additionally requires an explicit `WHISKAY_AI_PRIVATE_AUTO_ENABLED=true`.
5. **Self-authored update path:** the primary message handler emitted a general `message` event before dropping `fromMe` messages; Jadibot also lacked an explicit `fromMe` guard in the original source. These paths could expose bot-authored echoes to downstream message listeners or command parsing. They are now rejected at the earliest message-handler boundary and again in `CommandHandler`.
6. **Transport coverage:** the first outbound guard patch attached before `attachSerializerRuntime()`. The serializer wraps `sendMessage` and `relayMessage`, so that order replaced the guard wrappers. The final boot order attaches the outbound guard after serializer setup for both primary and Jadibot sockets. A Stage 58 regression test enforces this order.

These source findings explain plausible mechanisms; they do not prove which one caused the historical account ban. A reliable attribution still requires the enforcement notification from WhatsApp and timestamped logs from the affected session.

## Implementation

### Outbound policy guard

- Added `src/core/OutboundTrafficGuard.js` to intercept Baileys `sendMessage` and `relayMessage`.
- Uses a bounded `WorkloadScheduler`, per-recipient lane serialization, global start pacing, bounded queue and rejection when the queue is full.
- Performs same-recipient payload duplicate suppression and applies global/per-recipient rolling-window ceilings before a message is queued.
- The default starting values are intentionally conservative: 2 outbound workers, 2,000 ms minimum global start interval, queue capacity 50, 20 attempts per minute globally, 4 attempts per recipient per minute, and a 30-second exact-payload duplicate window. These are local safety settings, not published WhatsApp limits or a guarantee of account safety.
- `WorkloadTracker` stores only keyed hashes, source labels, outcomes, timestamps and aggregate counters. It does not persist raw JIDs or message bodies.
- The guard is attached after serializer wrappers so the guard remains the outermost `sendMessage` / `relayMessage` wrapper.

### Command containment

- `src/handlers/message.js` drops `ctx.isBot` messages before emitting feature/plugin events or entering any message/command/AI/XP path.
- `src/core/CommandHandler.js` independently rejects bot-authored or `fromMe` contexts as defense in depth.
- `src/plugins/general/jadibot.js` rejects self-authored messages and installs the guard after serializer wrappers.
- Removed the unprefixed natural-language egg-calculator dispatch. The plugin remains available through its explicit command.
- Nexora now defaults to `mention-only`; private automatic replies require a separate explicit opt-in.

### `.testcommands`

- `.testcommands run` starts the isolated verification worker silently. No acknowledgement, progress, phase, test-failure, or completion message is sent automatically. Duplicate run requests are also silent and do not create parallel verification jobs.
- `.testcommands status` / `.testcommands progress` are manual polling operations and are the only way to request run progress.
- `.testcommands report` and `.testcommands download` are manual operations. While a QA run is active they refuse to present an older report/ZIP as though it belonged to the active run.
- Verification executes inside a disposable workspace. The runner excludes `.env`, runtime data, session/auth directories, local databases, logs and generated reports.
- `ctx.suppressPostCommandXp` prevents generic level-up notices from being sent as a side effect of the silent run.

### `.bc` broadcast

- Requires an explicit group/user allowlist, a preview token, and owner confirmation. Group membership and registered-user records are not treated as consent.
- Disabled by default. Sending additionally requires `WHISKAY_BROADCAST_ENABLED=true`.
- Default maximum is 5 targets per campaign; implementation clamps the maximum to 5. Default interval is 30 seconds and the minimum is clamped to 30 seconds.
- Supports status and cancellation. Only one active campaign can run per process. An outbound policy block stops the campaign instead of continuing.

### Webhook outbound

- World Boss webhook requires authentication, an explicit target-group allowlist, a unique event ID and `WHISKAY_BOSS_WEBHOOK_ENABLED=true`. It is disabled by default.
- World Boss target count defaults to 5 and is clamped to 5; delivery spacing defaults to 30 seconds and has a 30-second minimum.
- TEAMDROP requires a configured recipient and records the source as `webhook:teamdrop`; World Boss sends record `webhook:world-boss`.

## Changed files

- `src/core/OutboundTrafficGuard.js` — outbound transport policy.
- `src/core/WorkloadTracker.js` — outbound rolling-window telemetry and threat score.
- `src/core/Bot.js` — startup ordering; load history and attach guard last.
- `src/plugins/general/jadibot.js` — same guard ordering and self-authored message containment.
- `src/handlers/message.js` — early `fromMe` rejection and removal of natural-language direct plugin dispatch.
- `src/core/CommandHandler.js` — defense-in-depth self-authored rejection.
- `src/plugins/owner/testcommands.js` — silent background QA and stale-report protections.
- `src/plugins/owner/broadcast.js` — explicit allowlist, preview, confirmation, opt-in enable flag, stricter caps and pacing.
- `src/index.js` — explicit World Boss opt-in, tighter target/pacing caps and webhook source attribution.
- `.env.example` — documented conservative defaults and opt-in switches.
- `test/stage58-outbound-safety.test.js` — outbound, broadcast, webhook and dispatch regression checks.
- `test/testcommands-plugin.test.js` — silent QA and active-run artifact tests.
- `README.md`, `docs/README.md`, `docs/project/CHANGELOG.md` — release and operator documentation.

## Configuration and migration

The new sample settings are in `.env.example`. Do not copy the supplied archive's `.env` into a new deployment; create a fresh local `.env` and transfer only settings that are still required. Keep the following switches false unless the owner has verified consent and operational need:

```dotenv
WHISKAY_AI_PRIVATE_AUTO_ENABLED=false
WHISKAY_BROADCAST_ENABLED=false
WHISKAY_BOSS_WEBHOOK_ENABLED=false
```

Keep `WHISKAY_BROADCAST_ALLOWED_GROUPS`, `WHISKAY_BROADCAST_ALLOWED_USERS`, and `WHISKAY_BOSS_TARGET_GROUPS` empty until the recipients have explicitly agreed to receive the corresponding announcements. The application does not infer consent from group membership or registration.

The local outbound rate and duplicate settings may be tuned only for legitimate interactive workloads. Increasing the values does not make a traffic pattern compliant and does not prevent platform enforcement.

## Operational verification

- Use `.workload status` to inspect outbound counts, source attribution, queue depth and the local risk state.
- Use `.testcommands run` to start local QA, then request `.testcommands status` manually. No WhatsApp progress messages are expected from the background worker.
- Test `.bc` in a controlled test environment with an empty allowlist first; preview must result in zero target deliveries. Leave broadcast disabled on production unless there is a verified consent-based use case.
- Keep World Boss disabled on production until each target group is explicitly approved.
- No actual WhatsApp send, ban/unban, account-quality check, or live group membership was exercised by the test suite.

## Rollback

Set `WHISKAY_BROADCAST_ENABLED=false`, `WHISKAY_BOSS_WEBHOOK_ENABLED=false`, and `WHISKAY_AI_PRIVATE_AUTO_ENABLED=false` before rollback. Revert the Stage 58 code as a single change set if necessary, but do not restore the original `.bc` or `.testcommands` implementations: those versions permit broad, rapid, unsolicited, or automatic sends. Keep the owner QA worker silent even if other code is rolled back.

## Part 1 boundary

Part 1 delivered deterministic outbound admission, privacy-minimized outbound telemetry and command containment. Stage 59 Part 2 adds a local feature-analysis agent in a bounded worker_threads pool with source quarantine. The agent is not an external generative model and does not predict or guarantee WhatsApp enforcement outcomes. A distributed multi-process state fabric is not included.

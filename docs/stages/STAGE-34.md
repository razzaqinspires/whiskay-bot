# Stage 34 — Energy Intelligence, Chronos, and Controlled Autonomy

Date: 2026-10-29. Bot version: `2.20.0`.

## Scope

Stage 34 takes the uploaded `final.zip` as an architecture reference. The older `Chronos.js`, `JobLoader.js`, `WorkloadTracker.js`, `BioCore.js`, `ReminderManager.js`, `SyntaxDoctor.js`, `proactiveWill.js`, and `Serializer.js` were reviewed. They were not copied wholesale. In particular, probabilistic false-positive quarantine, unbounded global mutable state, random mood swings, and worker task deletion were rejected as unsafe operational behavior.

## Implemented

- **Independent widget symbol visibility:** `.setmenu symbols visible before on|off` and `.setmenu symbols visible after on|off` control the prefix/suffix separately. Stored symbols are preserved when hidden. Legacy global toggle remains supported. Defaults and reset restore both sides.
- **Energy/workload estimator:** `src/core/WorkloadCortex.js` separates zero-cost control/recovery commands, declared static costs, and bounded dynamic estimates for network, AI, and heavy workloads. Estimation is deterministic and does not call an AI model.
- **Zero-energy leak prevention:** middleware now checks the estimated charge *before* executing a plugin, rejects insufficient balance, and fails closed when the ledger cannot be read or written. Control commands do not consume energy. This closes the prior `min(energy, cost)` behavior that could let a command run while only partially charged.
- **Energy Saver:** `.energy status` and `.energy saver on|off`. It can only be enabled below 20% battery, persists per user in `data/energy-saver.json`, reduces eligible costs by about 45%, and increases cooldown by 2.5×. When active below 20%, `.menu` renders only the first five sorted categories. The saver becomes ineffective when energy reaches 20% or more but the preference remains stored.
- **Button energy notice:** low-energy users receive an interactive status card with Charge, Energy Status, and Saver controls. A button is shown as available only below 20%.
- **Typo suggestions:** unknown commands can suggest nearest registered command and display textual similarity percentage. Owner controls `.typo on|off`, `.typo threshold 50..95`; settings are atomically persisted in `data/typo-settings.json`. Percentage means edit-distance similarity, not intent probability.
- **Meta-state telemetry:** `WorkloadTracker` measures interval CPU use, heap/RSS, and task counters; `MetaStateCortex` computes a deterministic operational health index and `.cortex status` includes workload, Chronos job counts, and memory counters. This is operational telemetry, not a consciousness measurement.
- **Memory decay:** `src/cognitive/short-term-memory.js` uses 12-hour half-life for ordinary conversation and 72-hour half-life for explicit `important`/`emotional-opt-in` tags; normal TTL is 7 days, tagged TTL 30 days. `.memory stats|tag|clear` exposes controls. Memory remains in RAM and is lost on restart. The bot does not infer trauma, cortisol, or mood.
- **Background JobLoader + ChronosCortex:** `src/core/JobLoader.js` loads only explicit `{name, intervalMs, run}` contracts from `src/jobs`. `ChronosCortex` prevents duplicate names, caps concurrency, catches task failures, and exposes counts/status without global variables. `Bot` starts/stops it with lifecycle.
- **ReminderManager:** `.reminder in 30m text`, `.reminder list`, `.reminder cancel ID`, `.reminder audit` (owner). Reminders are atomically persisted in `data/reminders.json`, bounded to 5,000, claimed before delivery, retried with backoff, and stale claims are recovered after five minutes.
- **Adzan reminders:** `.adzan status|on|off|set <prayer> HH:mm` in groups, controlled by group admins/owner. Default times are examples only and must be verified for the group's location. This is a scheduler, not a source of authoritative prayer times.
- **SyntaxDoctor read-only job:** `src/jobs/SyntaxDoctor.js` samples up to 50 JavaScript files under `src/` with `node --check`, stores a timestamped report, and never edits code. `.syntaxdoctor` is owner-only. Set `SYNTAX_DOCTOR_ENABLED=false` to disable the job.
- **Failure Memory Shard:** a command failing three times in 15 minutes is logically quarantined for 30 minutes. `.quarantine list|reset [command]` is owner-only. It never edits, deletes, or rewrites source files automatically.
- **NSFW access-control scaffold:** `.nsfw status|on|off|pause|resume|tokens <user> <n>` is owner-controlled; the reusable gate supports disabled/paused state, group opt-in, admin requirement, token deduction, owner token bypass, and critical-workload lock. No NSFW content-generation commands were activated in Stage 34; the policy layer is not a claim that content features are ready.
- **Bell Feature Gap Ledger and Event Shell Adapter:** `docs/stages/STAGE-34-BELL-GAP-LEDGER.md` records OWNED/PARTIAL/MISSING decisions; `src/core/EventShellAdapter.js` maps a legacy event shell into the Whiskay context rather than duplicating handlers.
- **Broadcast safety:** `.bc --preview pesan` counts targets and returns without sending. Existing owner-only, paced broadcast behavior remains.
- **World streaming telemetry:** RPG `WorldManager` accepts bounded `renderRadius` (1–4) and `treeDensity` (0–24), emits `whiskay:world-telemetry`, and exports a deterministic streaming-stat helper. This is procedural low-poly world streaming, not a new photorealistic asset pack.

## Energy model

1. `energyMode: 'free'` / explicit zero-cost control commands: 0 energy.
2. `energyMode: 'static'`: declared plugin cost, bounded by the energy ledger.
3. Dynamic tasks: bounded estimator based on command length and network/AI/heavy-task classification; runtime heap pressure adds a small surcharge.
4. If the available balance is below the adjusted estimate, the command is rejected before plugin execution.
5. Saver mode is available only at `<20%`, reduces eligible fixed/dynamic costs by 45%, and increases cooldown. It does not increase battery or bypass a balance check.

This is a heuristic model, not a measurement of actual CPU/GPU joules or provider token cost. `WorkloadCortex` currently uses Node heap pressure and declared task classes; interval-based CPU utilization, HTTP byte/latency telemetry, per-provider token usage, and historical forecasting remain future work.

## Commands

- `.energy status`
- `.energy saver on|off`
- `.cortex status`
- `.typo status|on|off|threshold 68`
- `.memory stats` / `.memory tag important|emotional-opt-in` / `.memory clear`
- `.reminder in 30m <text>` / `.reminder list` / `.reminder cancel <id-prefix>` / `.reminder audit`
- `.adzan status|on|off` / `.adzan set subuh 04:45` / `.adzan timezone Asia/Jakarta`
- `.syntaxdoctor` (owner)
- `.quarantine list` / `.quarantine reset [command]`
- `.nsfw status|on|off|pause|resume` / `.nsfw tokens <JID/nomor> <jumlah>`
- `.bc --preview <pesan>`

## Safety boundaries / known gaps

- JSON ledgers use atomic rename and in-process mutation queues, not cross-process transactions. Use one bot process for these local files and back up `data/`.
- A reminder marked `processing` is recovered after a five-minute stale claim, but WhatsApp delivery is not exactly-once: a process crash after send and before marking sent can produce a duplicate.
- The scheduler uses `setInterval` ticks and `intervalMs`; it is not a full cron parser. Reminder delivery depends on the bot connection. Adzan matching uses a per-group IANA timezone (default `Asia/Jakarta`), not the host timezone.
- `.adzan` defaults are illustrative and must be replaced with verified local timings.
- NSFW content features remain unimplemented; only owner policy/token scaffolding exists. Group opt-in setter and an audited content provider must be built before exposing category commands.
- WorkloadTracker samples process CPU between calls and records heap pressure, but this is not a calibrated host-wide CPU meter or physical energy/joule measurement. Meta-state is a heuristic health index; no claim of quantum computation or machine consciousness is made.
- WorldManager uses procedural geometry for trees; photorealistic NPCs, GLB asset procurement, animation retargeting, housing interiors, terrain chunk streaming from disk, and configurable control sensitivity remain follow-up work.
- Legacy BioCore's random affect values are not used as real biological/cortisol telemetry. No sensitive user mood is inferred or broadcast across groups.

## Verification

Run `npm run verify:stage34` and `npm run verify:all`. Tests validate deterministic helpers and contracts only; they do not prove a live WhatsApp session, prayer-time correctness, or external service availability.

# Changelog

## 2.35.28 — Stage 63 Part 6: Outbound Policy Enforcement (2026-11-09)
- Added final-boundary shared-ledger rechecks for quarantine, rolling global/per-recipient limits, duplicate payloads and stale reservation expiry.
- Improved media fingerprints to use byte/file content identity while ignoring volatile Baileys metadata and avoiding type-only media collisions.
- Required explicit source attribution before every guarded transport send; added stable labels for scheduled and event-driven background sources.
- Completed Stage 62 scheduler cancellation/idle and Chronos lifecycle follow-up fixes.
- Added Stage 63 focused verification and integrated it into outbound stability and full verification scripts.
- Focused tests: Stage 63 8/8; Stage 58–61 38/38; Stage 62 8/8 via isolated module-loader harness. Full npm suite and live WhatsApp behavior remain unverified due incomplete dependencies and no production session test.

## 2.35.26 — Stage 61 Part 4: Runtime Hardening & Multi-Instance Outbound Safety (2026-11-08)

- Added a shared persistent `OutboundPolicyStore` for single-host cross-process outbound reservations, rate limits, duplicate suppression, quarantine and send-slot coordination. The store uses the local exclusive file lock and atomic JSON persistence and fails closed when its schema or JSON is corrupt.
- Split per-process WorkloadTracker telemetry shards from the canonical shared outbound policy ledger. Only one-way actor/recipient/message hashes and bounded event metadata are retained; raw JIDs and message bodies are excluded from the policy store.
- Enforced the global minimum send interval at the final pre-Baileys transport boundary. Independent local processes cannot each apply a separate in-memory rate budget.
- Rechecked source quarantine immediately before transport so jobs queued before a quarantine are also blocked. Added an explicit regression for queued-job cancellation and for the broadcast hard-stop integration.
- Kept PM2 at one forked Baileys socket and retained `start.mjs` single-instance protection. Worker threads/background workers remain separate from WhatsApp socket instances. The cross-process policy store is single-host/local-filesystem only.
- Added a dependency preflight to `npm test` and repaired `verify:ops` to validate persistent webhook claim/complete operations. Added `verify:stage61` and `verify:outbound-stability`; Stage 61 is included in `verify:all`.
- Stage 61 passed 9/9; Part 4 selected cross-stage regression passed 76/76; the Part 3 explicit cross-stage set was rerun and confirmed 80/80 (the previous report's 79/79 subsection was a documentation counting error and is corrected in this release). `verify:ops` passed 8/8; syntax checks passed 323 JS/MJS/CJS files; repository integrity passed 323 source files / 426 relative imports / 0 missing imports.
- Full `npm test` remains BLOCKED because `npm ci` cannot reach the configured registry (`EAI_AGAIN`); preflight reports eight missing direct dependencies before launching the suite. No full-suite pass is claimed. Live WhatsApp/provider behavior and multi-host coordination remain untested.

See `docs/STAGE-61-RUNTIME-HARDENING-MULTI-INSTANCE-SAFETY.md` and `docs/reports/TEST-REPORT-STAGE-61-RUNTIME-HARDENING-MULTI-INSTANCE-SAFETY.md`.


## 2.35.25 — Stage 60 Part 3: Data Integrity & Core Stability Recovery (2026-11-08)

- Added `src/utils/PersistentJsonStore.js` with strict JSON reads, synced atomic writes, valid-prior-state backups, and a local-host cross-process lock with stale-owner detection and bounded acquisition timeout.
- Protected all Energy ledger mutations with the shared file lock. `getEnergy()` performs an unlocked snapshot read for the common path and re-reads under lock only when a charging completion needs persistence.
- Corrupt or schema-invalid Energy ledgers now fail closed instead of silently falling back to `{}`. Every normal Energy ledger replacement keeps the last valid version in `data/energy-ledger.json.bak`; `scripts/energy-ledger-recovery.mjs` reports primary/backup health and offers explicit backup restore while preserving the current primary under a unique pre-restore name.
- Made energy consumption all-or-nothing when a concurrent command has already consumed the remaining balance. The Energy middleware now aborts plugin execution if the transaction returns `insufficient-energy`.
- Changed passive regeneration from one fixed increment per scheduler tick to elapsed-time accounting with a persisted per-user timestamp. Five-second scans and the same file lock prevent duplicate credit from multiple local PM2/fork instances.
- Made plugin file discovery deterministic and added `src/core/PluginRegistry.js`. Command/alias token collisions no longer silently replace owners; deterministic winners are kept, collisions are recorded, and `.reload` shows owner-only registry diagnostics. No candidate plugin was deleted.
- Replaced process-local webhook deduplication for TEAMDROP and World Boss with persistent SHA-256 event claims in `data/webhook-idempotency.json`; claims are written under a cross-process lock before WhatsApp delivery and retained for 24 hours, capped at 5,000 events.
- Documented the at-most-once webhook trade-off: a crash after claim but before delivery may suppress a retry for the retention period. This favors duplicate-send prevention over guaranteed delivery.
- Added Stage 60 tests for corrupted ledger preservation, automatic backups, explicit restore, concurrent process updates, no-overdraw debit behavior, webhook event claims and corruption fail-closed behavior, and deterministic plugin command collision handling.
- Stage 60 tests pass 11/11, including clean-install missing-file status, cross-process ledger concurrency, overdraw prevention, corrupt-store fail-closed behavior, charging/debit reconciliation, passive-regeneration no-write behavior at full capacity, and deterministic plugin collisions. Combined focused cross-stage regression passes 80/80; repository integrity checks 321 source files and 423 relative imports with zero missing paths.
- Full `npm test` most recently reported 418/448 passed and 30 failed. The environment's `npm ci --ignore-scripts --no-audit --no-fund` timed out and left an incomplete dependency tree; 25 failures directly show missing `dotenv/config`, while five top-level wrappers remain unclassified. Repeat the full suite after successful `npm ci`; no full-suite PASS is claimed.

See `docs/STAGE-60-DATA-INTEGRITY-CORE-STABILITY.md` and `docs/reports/TEST-REPORT-STAGE-60-DATA-INTEGRITY-CORE-STABILITY.md`.

## 2.35.24 — Stage 59 Part 2: Workload Threat Intelligence & Multi-Worker Agent (2026-11-08)

- Extended WorkloadTracker with rolling command-execution telemetry using normalized command names and hashed actor identities; raw JIDs, command arguments, message content and credentials are excluded.
- Added a bounded two-worker `worker_threads` pool for local threat analysis, including job timeouts, queue caps, worker restart accounting and graceful shutdown.
- Added multi-window analysis for outbound velocity, source/recipient concentration, failed sends, blocked duplicates, command-per-actor bursts, rolling 10-second baselines and runtime pressure.
- Added NORMAL / ELEVATED / HIGH / CRITICAL threat reports, explainable evidence factors, recommendations, and TTL-limited source quarantine for a narrowly defined high-confidence burst signature.
- Enforced quarantine at the OutboundTrafficGuard before Baileys transport. Command completion, level-up and energy-notification traffic now receives explicit source attribution.
- Added owner controls `.workload threat` and `.workload clear-quarantine`; background analysis sends no WhatsApp alerts. The local feature agent does not call external LLM providers and cannot authorize outbound messages.
- Focused regression suite passed 73/73 tests including Stage 58 outbound safety, Stage 59 worker pool/quarantine, repository Stages 52–57, silent `.testcommands`, and the new broadcast hard-stop on Threat Agent quarantine. Full `npm test` was attempted: 406/436 passed, 30 failed, 0 skipped. Of the 30, 25 report the known incomplete-install error `ERR_MODULE_NOT_FOUND: dotenv/config`; five test-file failures have only a generic wrapper and remain unclassified. A clean `npm ci` and repeat full suite are required; no full-suite pass is claimed.

See `docs/STAGE-59-WORKLOAD-THREAT-INTELLIGENCE.md` and `docs/reports/TEST-REPORT-STAGE-59-WORKLOAD-THREAT-INTELLIGENCE.md`.

## 2.35.23 — Stage 58 Part 1: Outbound Traffic Safety & Command Containment (2026-11-08)

- Compared the original v2.35.22 source with the current changes and documented two strong potential sources of historical outbound bursts: unrestricted `.bc` fan-out at 900 ms per target, and `.testcommands` progress messages emitted from every background QA event. This is source-level evidence, not proof of WhatsApp enforcement cause.
- Added an outbound safety guard for Baileys `sendMessage` and `relayMessage`; corrected boot order so the guard wraps serializer tracking wrappers instead of being overwritten by them.
- Added privacy-minimized WorkloadTracker outbound risk counters, duplicate checks, rate windows and bounded queue pressure telemetry. Defaults are stricter and are not claimed to represent official WhatsApp limits.
- Made `.testcommands run` silent; `status`, `report`, and `download` require manual owner requests. Stale reports and diagnostic ZIPs are hidden while a new QA run is active.
- Rebuilt `.bc` with explicit allowlists, preview token, owner confirmation, a separate disabled-by-default enable flag, a five-target cap and a 30-second minimum interval.
- Disabled World Boss outbound by default, retained authenticated explicit group allowlists, reduced its cap and delivery frequency, and attributed webhook sends in outbound telemetry.
- Dropped self-authored messages before feature events and added a second `fromMe` check in `CommandHandler`; removed natural-language direct invocation of the egg calculator; changed Nexora's private auto-response to explicit opt-in.
- Added regression coverage for guard attachment order, self-authored dispatch, broadcast opt-in, silent QA and stale report prevention.
- Focused Part 1 QA passed 73/73 tests; syntax audit passed 313 files and repository integrity checked 410 relative imports with no missing paths. The full `npm test` run is not green (401/431 passed, 30 failed) because `npm ci` timed out and the environment retained an incomplete dependency tree; no full-suite pass is claimed.
- Runtime/live WhatsApp validation and full-suite results must be recorded separately; the source ZIP does not contain provider enforcement diagnostics.

See `docs/STAGE-58-OUTBOUND-TRAFFIC-SAFETY.md` and `docs/reports/TEST-REPORT-STAGE-58-OUTBOUND-TRAFFIC-SAFETY.md`.

## 2.35.21 — Git Upload Whitespace Hotfix (2026-11-02)

- Removed trailing whitespace from the changed Adzan status message line in `src/plugins/general/adzan.js`.
- Removed the extra blank line at EOF from `test/stage48-teamdrop-relay.test.js` and `vendor/razzaq-adzan-engine/src/prayer-times.mjs`.
- Kept the strict staged `git diff --check` validation enabled for JavaScript, MJS, CJS, JSON, YAML, shell and Python files. No validation bypass or auto-rewrite of user files was introduced.
- Added a focused regression test for the exact three reported paths so the same whitespace failures are caught before the next upload.

## 2.35.15 — Stage 52: Repository Structure Cleanup (2026-11-01)

- Moved project changelog and working memory to `docs/project/`, third-party notices to `docs/legal/`, pairing setup to `scripts/pair.mjs`, and PM2 configuration to `config/ecosystem.config.cjs`.
- Archived the inactive `github/` workflow mirror and the loose local patch under `docs/archive/`; `.github/` remains the only active GitHub Actions directory.
- Removed unreferenced pre-release source snapshots, duplicate legacy environment/ignore templates, and stale generated local QA outputs while retaining active tests, source, runtime data, and stage history.
- Updated root/document links, package scripts, package-lock metadata, Git upload auditing, and the project README for the new paths.
- Added Stage 52 structural regression checks to `npm run verify:stage52` and `npm run verify:all`.

## 2.35.14 — QA Reporter and Git Upload Reliability (2026-11-01)

- Aligned Owner QA test discovery and reporter assertions, restored the Git upload launcher executable mode, and retained the `ANALYZE → QA → PUSH` safety gates.
- Standardized the `npm test` ZIP report workflow under `data/test-reports/`, with a separate archive path for dependency-install diagnostics.
- Historical verification recorded 353 passing and 30 failing tests out of 383 because npm registry DNS resolution failed (`EAI_AGAIN`). This was not a green full-suite result; see `docs/TEST-REPORT-GIT-UPLOAD-NPM-TEST-2026-11-01.md`.

## 2.35.13 — QA Regression Fix (2026-11-01)

- Removed the duplicate `grouphelp` command registration and fallback handler from `group-safety`; `group-tools` remains the single authoritative interactive help handler while safety commands continue to reference `.grouphelp`. Updated both Stage 41 and the older group-control safety test to enforce the same single-owner rule.
- Updated Stage 46/47 release tests to validate semantic-version format and consistency between `package.json` and `package-lock.json`, rather than pinning the project forever to historical version `2.35.4`.
- The Stage 46/47 and Git launcher permission focused test files pass 14/14 after the change. Stage 41 execution requires the complete project dependencies; the packaging environment did not complete `npm ci`, so its runtime test is not claimed as executed here.
- The supplied terminal excerpt showed three named failing tests; it reported four total failures, so the fourth failure is not identifiable from the excerpt and must be recovered from the complete TAP output before declaring the full suite green.

## 2.35.12 — Stage 51 Part 8: Smart Adzan Automation (2026-11-01)

- Added per-user Friday/Jumu'ah reminder with a configurable IANA-local `HH:mm` send time.
- Added opt-in Ramadan automation with Sahur reminders before calculated Fajr and Iftar reminders at/before calculated Maghrib; Hijri month detection is explicitly tabular-civil and not an official rukyat decision.
- Added `.adzan automasi`, `.adzan jumat on|off|HH:mm`, `.adzan ramadan on|off`, `.adzan sahur 0..120`, and `.adzan iftar on|off|0..60` controls. Automation messages are text-only and DM-only, and require `.adzan on` subscription.
- Added DST-aware IANA local wall-clock conversion with rejection of nonexistent local times. The worker recalculates profiles every 15 seconds; changes to personal location/timezone/automation settings and opt-out cancel queued stale events.
- Added focused automation tests for validation, local-time conversion, Friday delivery/deduplication, Ramadan Sahur/Iftar timing, profile refresh cancellation, command handlers and group restriction.
- Fixed `git upload` permission handling: the launcher now resolves its own project root, ships with mode `0755`, and has a one-time installer that configures a repository-local alias to invoke the script through Bash.
- Packaging excludes active `.env`, Baileys sessions, pairing tickets, runtime databases/cache, saved images and generated test output. The static dungeon floor seed remains included.
- Validation: seven focused automation tests passed; the Git launcher passed Bash syntax and executable-mode checks. Full project suite and live WhatsApp delivery were not run in the packaging environment.

## 2.35.11 — Stage 51 Part 7: Advanced Adzan Intelligence (2026-10-31)

- Added personal Qibla bearing from true north using the vendored engine's Kaaba geodesic calculation; the command warns that a phone compass requires calibration and magnetic-declination awareness.
- Added an estimated Hijri date using the engine's tabular-civil algorithm. Output explicitly distinguishes this calculation from official rukyat decisions.
- Added next-prayer countdown, seven-day and 30-day prayer schedule summaries, and a personal `.ics` calendar attachment export.
- Added per-user pre-Adzan text reminders configurable from 0 to 30 minutes. Pre-alerts are persisted in the existing durable outbox, deduplicated by user/date/prayer key, and do not send audio.
- Corrected scheduler ordering so pre-alerts are queued before the actual prayer time; the dedicated regression test covers this boundary.
- Added six focused intelligence tests covering Qibla/Hijri/countdown, date ranges, iCalendar output, pre-alert validation/subscriber propagation, scheduler delivery and private command handlers. Live WhatsApp attachment delivery and production scheduling remain owner-host checks.

## 2.35.7 — Stage 51 Part 3: Razzaq Adzan Engine Integration (2026-10-31)

- Vendored the user's `@razzaq-ventures/adzan-engine` v1.3.0 source, upstream README, package metadata and MIT license without changing upstream engine source.
- Added `.adzan jadwal` for personal five-prayer calculations using each user's own coordinates, effective IANA time zone and Indonesia/Kemenag reference preset.
- Added private-chat opt-in/out via `.adzan on/off`; scheduled personal notifications target the user's DM. Existing manual group reminder commands remain compatible.
- Added a 15-second per-user scheduler scan and durable per-user/date/prayer event claims to suppress duplicate delivery after restart. Claims are at-most-once: a crash after claim but before send may miss that notification; this is documented.
- Added tests for engine calculation, five prayer timestamps, timezone/method metadata, subscription state and durable duplicate suppression. Focused suite passed 10/10.
- Calculation metadata explicitly remains `officialValidation: false`; schedules are approximate and require local authority/mosque verification. Live WhatsApp delivery and crash-boundary testing remain owner-host checks. Audio delivery is deferred to Part 4.


## 2.35.6 — Stage 51 Part 2: Adzan Personal Region Profiles (2026-10-31)

- Added owner-default and per-user Adzan region profiles with opt-in WhatsApp static-location capture, expiring location requests, coordinate validation and Google Maps links. Location capture is private-chat-only to avoid disclosing GPS coordinates in groups.
- Added per-user and owner-default IANA timezone settings. GPS coordinates do not determine an IANA timezone in the supplied engine, so the command explicitly supports manual timezone selection and does not claim automatic timezone inference.
- Replaced the fragile group-only Adzan JSON manager with a shared schema-validated profile store. Writes use temp-file atomic replace, fsync, a cross-process lock, a verified previous-generation `.bak`, and abort-on-backup-failure behavior. Corrupt primaries are quarantined and recovered only from a valid backup; unrecoverable data is not silently reset.
- Migrates valid legacy `data/adzan-settings.json` group settings once into `data/adzan-profiles.json` while preserving the legacy file under a `.migrated-*` name. Existing manual group reminder APIs remain compatible.
- Added Stage 51 profile-store tests for owner/user isolation, request gating, timezone validation, backup recovery, backup-write failure, legacy migration and group API compatibility. Focused result: 8/8 PASS. Live WhatsApp location receipt and production storage behavior still require owner-host verification.
- Prayer-time scheduler integration and actual WhatsApp audio playback are not part of this part; they remain in the next staged delivery.

## 2.35.5 — Stage 50 Leveling Data Integrity & Recovery (2026-10-31)

- Fixed a persistence failure path where a backup-write error could be mistaken for a primary-read failure and cause the active leveling database to be quarantined/replaced. Backup failure now aborts the save without changing the primary.
- Hardened atomic temp-file cleanup, schema checks, process-lock stale detection, corrupt-primary quarantine, and manual backup restore.
- Extended `.leveldb status` with primary/backup health, file sizes, and aggregate XP.
- Isolated the Stage 35 test fixture before importing the leveling module, including direct `verify:stage35` / `verify:all` execution.
- Added `npm run protect:runtime-data` (with a `protect:leveling-data` alias); the explicit auto-push path removes legacy tracked runtime `data/` files from the Git index without deleting local files and retains the static dungeon floor seed.
- Focused verification: Stage 35, Stage 43 leveling storage, Git-protection, and auto-push guard tests passed 15/15. Full suite and live WhatsApp/production recovery were not run in the packaging environment.

## 2.35.4 — Owner QA live per-test progress and Baileys session diagnostics (2026-10-31)

- Added a Node.js `node:test` custom reporter that streams machine-readable test discovery, pass/fail events, diagnostics and final counters. It uses the Node test runner event stream instead of depending on human-readable reporter formatting.
- `.testcommands` now sends live progress after the first completed test, every five completed tests, and immediately when a test fails. Each card shows completed, passed, failed and discovered counts plus the latest test name.
- Added syntax-audit progress, phase completion notices, `.testcommands progress`, and active-run counters to the status view. The run remains active until every configured phase finishes; phase PASS is distinct from final FULL TEST LULUS.
- Added a dedicated classification for missing `sessions/pre-key-<id>.json` references. The runner never fabricates pre-keys, copies production sessions into the sandbox, or deletes auth state; test fixtures must mock Baileys auth state and use temporary storage.
- Added regression tests for reporter event aggregation, exact summaries, live progress cards and missing-pre-key classification.
- Validation: targeted testcommand/reporter suite passed locally; complete project suite and live WhatsApp progress delivery still require a full dependency install and owner-host verification.

## 2.35.3 — Stage 48 TEAMDROP document relay (2026-10-30)

- Added a private, bearer-authenticated webhook endpoint for TEAMDROP raw document uploads.
- Reused the existing Baileys socket to deliver documents to the configured WhatsApp recipient; no Cloud API credentials or second WhatsApp login are required.
- Added document extension and size checks, per-source rate limiting, stable submission IDs, duplicate suppression, and secret-masked recipient configuration.
- Updated TEAMDROP portal transport, retry behavior, setup notes, Mermaid architecture, and Stage 48 verification.
- Local verification: Stage 46 environment tests and Stage 48 integration contract tests passed. Live WhatsApp send and deployment reachability still require a real connected bot session.

## 2.35.2 — Stage 47 Iteration 1

- Fixed `npm start` preflight: missing optional bundled ARM64 binaries no longer produce a misleading failure when a system Cloudflared executable is installed; the selected binary is version-checked.
- Hardened Baileys reconnect lifecycle with one in-flight socket creation, socket-generation guards, a persistent retry counter, capped exponential backoff with jitter, and no forced process exit after ten transient disconnects.
- Graceful shutdown cancels pending reconnect timers and clears the active socket reference. Logged-out and invalid-auth states are reported without repeatedly creating sockets.
- Validation is local/static; live WhatsApp connection recovery must still be checked on the target server.

# Changelog

## 2.35.4 — Owner Testcommand delivery and command routing fix (2026-10-31)

- Registered all names actually used by the owner: `.testcommands`, `.testcommand`, `.testcmd`, and `.testcmds`.
- Bare invocation now displays help instead of unexpectedly starting a lengthy `npm ci` and full QA pipeline. The full run requires `.testcommands run`.
- Moved the long runner to a managed background task after an immediate WhatsApp acknowledgement; the bot message handler can continue processing other messages while QA runs.
- Added active-run duplicate protection, a usable status command during QA, phase progress notices, and plain-text fallbacks when interactive message delivery is unavailable.
- Reduced the plugin cooldown to 2.5 seconds; active-run state and the runner's exclusive lock prevent duplicate work rather than blocking status/help behind a 60-second command cooldown.
- Added six plugin behavior tests covering aliases, default help, owner gating, immediate background acknowledgement, duplicate prevention, status during execution, completion delivery, and interactive fallback.
- Focused validation: `npm run verify:testcommand` passed 13/13 tests; 277 JavaScript files passed `node --check`. Full project `verify:all`, live Baileys message delivery, and a real registry-backed `npm ci` were not run in this patch.

## 2.35.4 — Energy middleware regression and documentation correction (2026-10-31)

- Replaced the brittle Stage 32 source-text assertion with behavioral checks for free/zero-cost exemptions, declared paid costs, zero/insufficient balances, exact-balance allowance, and invalid-balance fail-closed behavior.
- Added the shared `canExecuteWithEnergy()` policy and wired it into the energy middleware so malformed ledger/workload values cannot accidentally pass affordability checks.
- Explicit free mode and numeric zero-cost declarations remain exempt; positive static costs remain bounded to 0.05–10 energy points.
- Corrected current README and Stage 31/32 notes: ledger read/write failures stop paid command execution (fail-closed), not fail-open.
- Refreshed stale Stage 34 regression expectations and documentation to match the adaptive Stage 45 cooldown model and weighted workload thresholds; no runtime policy was changed for that cleanup.
- Local verification: Stage 32 regression suite passed 5/5. Full suite and live WhatsApp behavior were not rerun/claimed.

## 2.35.1 — Stage 46 Iteration 2
- Bound `.gitpush` approvals to the exact Git `HEAD` commit as well as staged, unstaged and untracked content, preventing a new local commit from slipping into an earlier approval window.
- Fixed retry after a transport failure: already-created local commits ahead of `origin/main` are now pushed even when the working tree is clean; staged changes are committed only when present.
- Added integration regressions for clean-tree local commits and HEAD changes after analysis. Targeted validation passed 24/24; no reset, stash, workflow rewriting or automatic rebase was introduced.

## 2.35.0 — Stage 46 Iteration 1
- Routed `npm start` through a detached daemon launcher with launch/PID locks, background log capture, `npm stop` / restart / status / logs controls, and a single-process preflight that prints `uname -m`, `which cloudflared`, both requested ARM64 paths, and resolver readiness.
- Resolved Cloudflared bundled paths from the repository root and clear failed `spawn` child references so ENOENT retries can recover instead of reusing a dead child.
- Added `.env.example`, a 90-key/9-category whitelisted environment schema, the owner-only `.config` button center, secret masking (including downloader endpoints), atomic `.env` updates and serialized debounced hot reload.
- Updated `.owner` contact card to read its display name from `OWNER_NAME`; added Arifi Razzaq as package author and repository metadata.
- Added owner-only `.gitpush` dashboard: read-only repository/CI/Cloudflared/release analysis, syntax + npm QA, fingerprint-bound approval, secret scanning, and explicit commit/push button. Replaced the uploaded script's reset/stash/rebase behavior with a guarded workflow.
- Added Stage 46 tests and documentation. Focused verification: 10/10 Stage 46 tests passed; real WhatsApp delivery, host Cloudflared execution and production GitHub push remain unverified.

## 2.33.0 — Stage 44 Iteration 1
- Isolated classic quiz sessions by chat and game type so Tebak Gambar, Tebak Anime, and other quiz modes can run independently without stealing or blocking each other’s timers/polls.
- Added game-specific hint/forfeit/clear targeting and global `.toptebakgambar` / `.toptebakanime` leaderboards.
- Added `serializer.js` poll-upsert normalization for Baileys `pollUpdateMessage`; `serializer-compat.cjs` is intentionally unchanged.
- Fixed poll aggregation to retain the full poll-creation WAMessage, not only its inner message payload.
- Connected quiz victories to the durable Stage 43 leveling store: each game tracks its own wins/XP, and rewards also credit the player’s group leveling profile. Tebak Gambar and Tebak Anime grant 35 XP + 5 coins per win.
- Added regression tests for session isolation, poll routing, full poll message retention, and persisted game-specific rewards.
- Live WhatsApp poll vote delivery/decryption remains a production-session verification item.

## 2.31.0 — Stage 42 Iteration 1
- Fixed World Boss tunnel executable resolution: an invalid/stale `CLOUDFLARED_BIN` now falls through to the architecture-matched bundled binary, `./bin`, and PATH instead of repeatedly spawning a guaranteed-ENOENT path.
- Added actionable cloudflared diagnostics and regression tests for valid fallback and missing-binary cases.
- Documented Baileys LID identity changes, app-state sync missing-key failures, and group sender-key decryption retries. These protocol-level events are not masked or “fixed” by deleting auth keys; operational recovery guidance preserves the linked-device session.
- Live WhatsApp Signal resync/decryption and a real Cloudflare tunnel remain deployment-level checks.

## 2.30.0 — Stage 41 Iteration 4
- Bound every native quiz poll to the user who started the session; votes from other group participants are ignored silently.
- Regular quiz rounds consume the designated user's first poll selection and finish after that one click; `.jawab` cannot bypass an active poll.
- Family 100 keeps its multi-answer rounds by issuing a fresh single-select poll for each answer, still restricted to the session creator.
- Expanded tests to check every built-in quiz database row for four unique A–D options and verify poll-voter authorization.
- Checked serializer sender aliases and accumulated `messages.update` poll payloads; live WhatsApp behavior remains unverified.

## 2.29.0 — Stage 41 Iteration 3
- Quiz games now generate four distinct A–D multiple-choice options from local/remote question data.
- Native WhatsApp polls use `selectableCount: 1`; poll vote events are routed through `messages.update` before ordinary command parsing.
- First vote per player is authoritative for the active round; later vote changes do not grant another attempt.
- Tebak Gambar sends the image when a valid source image is available, followed by the single-select poll.
- Added tests for A–D choice generation and poll event routing; included Stage 41 tests in `verify:all`.
- External poll delivery and vote decryption still require a live WhatsApp session for end-to-end verification.

## 2.27.0 — Stage 41 Iteration 1

- Added ten classic quiz/game commands from the supplied `game.js` excerpt, plus `.jawab`, `.hint`, `.cleargame`, `.nyerah`, and `.cek`.
- Added bounded, timeout-protected remote quiz-data loading with local fallback prompts.
- Exposed individual group commands in the dynamic menu via `menuCommands`; removed duplicate `.grouphelp` ownership from group-safety.
- Added Stage 41 regression tests and documentation.

## 2.26.9 — Stage 40 Iteration 10

- Added a machine-readable parity audit mapping all 17 recorded Experimental-Bell source families to concrete Whiskay target modules and next actions.
- Added regression tests ensuring target mappings exist and the audit does not falsely claim complete command parity.
- Explicitly recorded converter.js and tts.js as dedicated-plugin gaps for the next implementation batch.
- Documented that the upstream source could not be re-fetched in this environment; prior command counts need fresh source validation.

## 2.26.8 — Stage 40 Iteration 9

- Limits YouTube search queries to 200 characters and normalizes whitespace before invoking yt-dlp, preventing unbounded command arguments.
- Expires inactive YouTube search sessions after 30 minutes and prunes stale sessions when a new search session is saved.
- Adds regression tests for lookalike downloader domains and bounded YouTube search input.
- Live external downloader APIs and production WhatsApp delivery remain unverified.

## 2.26.6 — Stage 40 Iteration 7

- Caps downloader provider response bodies at 1 MiB and reads response streams with a bounded reader before JSON parsing.
- Prevents a forged or unavailable format selection from consuming a valid sender/chat-bound downloader token.
- Adds regression tests for oversized provider payloads and unavailable-format token preservation.
- Live third-party provider, DNS resolution, and WhatsApp production delivery remain unverified.

## 2.26.5 — Stage 40 Iteration 6

- Prevented unauthorized senders or chats from consuming another user's downloader selection token; valid tokens remain single-use.
- Added expiry cleanup and a 2,000-entry cap for pending downloader selections to bound in-memory state.
- Rejects array or non-object JSON from downloader providers and adds regression coverage for malformed responses and token ownership.
- Live provider and WhatsApp delivery checks remain deployment-level tasks.

## 2.26.4 — Stage 40 Iteration 5

- Hardened URLs returned by third-party downloader providers: reject localhost/local domains and private or reserved IP literals before the media URL is passed to WhatsApp's media fetcher.
- Sanitize provider-supplied media titles before using them in interactive messages.
- Added regression tests for local/private URL rejection and public CDN URL compatibility.
- This check does not perform DNS resolution; provider hostnames that resolve to private IPs still require network-level egress controls.

## 2.26.3 — Stage 40 Iteration 4

- Audited downloader aliases against the Experimental-Bell source command inventory and added missing Facebook, Instagram, TikTok, and YouTube downloader aliases.
- Extended `.dlvlink` with a direct MP4 choice alongside MP3, M4A, and Opus voice note.
- Corrected the YouTube play command description to reflect its actual search/preview flow.
- Added Stage 40 Iteration 4 regression coverage and documentation.

## 2.26.2 — Stage 40 Iteration 3

- Added `.ytm4a` audio download, `.playvn` Opus voice-note sending, and `.dlvlink` format picker for YouTube URLs.
- Expanded YouTube preview buttons and help text for MP3, M4A, voice note, and MP4 options.
- Added regression coverage for the new commands and WhatsApp payload modes.

## 2.26.1 — Stage 40, Iteration 2 (2026-10-29)

- Added `.gitclone` / `.ghclone` for public GitHub repository ZIP archives with strict repo URL parsing, redirect-host allowlist, timeout, and 24 MB streamed download cap.
- Added `.yts` alias for YouTube search and `.play` alias for YouTube search/play flow; retained paginated search, preview, and explicit download format selection.
- Added regression tests for GitHub repo parsing, branch validation, plugin registration, and aliases. Live GitHub download and WhatsApp media delivery remain unverified.

## 2.26.0 — Stage 40, Iteration 1 (2026-10-29)

- Added Pinterest, MediaFire, Spotify, YouTube URL, and RedNote downloader adapters to the shared provider service.
- Extended host allowlists and documented the provider contract and known exclusions.
- Added Stage 40 tests for platform URL allowlists, plugin inventory, and provider configuration.
- YouTube search/play and GitHub clone ZIP parity remain deferred; live provider/API behavior is unverified.

## 2.25.5 — Stage 39, Iteration 6 (2026-10-29)
- Added persistent per-group `.blacklist @anggota` / `.unblacklist @anggota` with admin/owner protection and message-handler enforcement; blacklisted messages are suppressed and deleted when the bot has permission.
- Added `.getpp` for own/mentioned/replied user profile photos, `.getppgc` for group profile photos, and `.infogc` / `.infogroup` aliases.
- Expanded group feature parity audit and added mocked regression tests for blacklist persistence/protected targets and profile-picture API/privacy failures.
- Live WhatsApp behavior and Baileys API compatibility remain unverified; see Stage 39 Iteration 6 report.

## 2.25.4 — Stage 39, Iteration 5 (2026-10-29)
- Added Experimental-Bell-compatible group setting aliases: `.open`, `.close`, `.locked`, `.unlocked`, `.linkgc`, `.resetlink`, `.setname`, and `.setdescription`.
- Added `.group <action>` umbrella for opening/closing the group, invite link, invite reset, metadata lock/unlock, subject, and description actions.
- Added explicit API capability/error handling for group invite code, revoke invite, and group settings calls; updated group help and README.
- Added mocked-socket regression tests for alias mapping, permission flow, umbrella validation, and invite-link retrieval. Live WhatsApp behavior remains unverified.

## 2.25.3 — Stage 39, Iteration 4 (2026-10-29)
- Added persisted per-group `.absen buka [judul]`, `.absen`, `.absen list`, `.absen tutup`, and `.absen reset`; entries are deduplicated by sender, capped at 1,000, and admin-gated for lifecycle controls.
- Added `.pinchat` / `.pinpesan` for a replied-to message with explicit duration allowlist (24h, 7d, 30d), admin permission checks, and graceful socket/API failure handling.
- Extended group settings validation to persist attendance records safely; added regression tests and Iteration 4 docs. Pin behavior still requires live validation against the deployed Baileys/WhatsApp API.

## 2.25.2 — Stage 39, Iteration 3 (2026-10-29)
- Added `.totag` and `.tohidetag` to relay a replied-to text or supported media message to the group, with media size limits and guarded failure handling.
- Added `.inviteinfo <WhatsApp invite link>` with strict invite URL validation and graceful fallback when Baileys does not expose `groupGetInviteInfo`.
- Added `.setppgc` for replying to an image and updating the group profile picture, with image MIME and 5 MB limits plus explicit socket capability checks.
- Added focused mocked-socket tests and Stage 39 Iteration 3 documentation. Live WhatsApp permission/API behavior remains unverified.

## 2.25.1 — Stage 39, Iteration 2 (2026-10-29)
- Added persisted per-group `.groupschedule close HH:MM` / `.groupschedule open HH:MM`, `.groupschedule list`, and `.groupschedule off` controls in WIB.
- Registered a duplicate-safe 30-second Chronos job to apply due group open/close actions once per Jakarta date, record each action separately, and log failures without crashing the bot.
- Added `.setleavetext` alongside `.setwelcometext`, allowing admins to customize both participant event messages with `{user}` and `{group}` placeholders.
- Added schedule validation and mocked-socket regression tests; live WhatsApp behavior still requires verification on a real group where the bot has admin rights.

## 2.25.0 — Stage 39, Iteration 1 (2026-10-29)
- Audited Experimental-Bell group administration commands against existing Whiskay group tools and moderation.
- Added per-group `.bancmd` / `.unbancmd` with persistent command block lists and protected recovery commands. Non-admin members are blocked at the central command gate; group admins and bot owners can still recover controls.
- Added `.ephemeral off|24h|7d|90d|status` using Baileys `groupToggleEphemeral` with explicit method/duration validation and graceful fallback.
- Added Stage 39 regression tests and documented deferred parity items (scheduled open/close, welcome/leave templates, and broader settings aliases).

## 2.24.3 — Stage 38, Iteration 4 (2026-10-29)
- Added persistent `.offline <alasan>`, `.online`, and `.offlinestatus` owner controls using Whiskay runtime state.
- Offline mode gates non-owner commands while preserving essential commands and owner access; offline notices are rate-limited per sender in-process.
- Added normalization and offline-gate regression tests. Remote update/install execution remains deferred until an authoritative update source, signature/integrity verification, and rollback policy are configured.

## 2.24.2 — Stage 38, Iteration 3 (2026-10-29)
- Added persisted runtime owner grants (`data/owner-access.json`) integrated with central owner authorization; only primary `.env` owners can add/remove grants and primary owners are non-removable through commands.
- Added native WhatsApp block/unblock with explicit confirmation, PN-only target validation, and self/owner protection.
- Added read-only session metadata inspection; no command deletes credentials or Baileys key stores.
- Added isolated security tests and Stage 38 Iteration 3 documentation.

## 2.24.0 — Stage 38, Iteration 1 (2026-10-29)
- Added owner-only group inventory/pagination, validated invite joining, explicit in-group leave confirmation, registered-user listing, and API-key presence audit without revealing secrets.
- Audited existing owner commands first to avoid cloning broadcast, console, ops, energy, newsletter, backup, reload, or test tooling.
- Added Stage 38 tests, docs, audit ledger, and `verify:stage38`. Live WhatsApp actions remain unverified by mocks.

## 2.22.0 — Stage 36 (2026-10-29)
- Added EventRegistry with safe event dispatch, validation guards and recursion depth limits.
- Added centralized Indonesian/English event locale helper and helper adapters for mention, URL and media normalization.
- Added Experimental-Bell helpers/Events inventory and parity matrix; explicitly marks partial/gap items rather than claiming wholesale porting.
- Added Literasi 1–5 audit plan with 250 subcategories and regression tests.

## 2.21.0 — Stage 35 (2026-10-29)

- Rebuilt `.catur` around `chess.js` legal move validation, FEN/PGN persistence, check/checkmate/castling/en passant/promotion, recommendation quick reply, legal-move list, and chess leaderboard.
- Added command-based XP and leveling progression for successfully executed commands, with anti-farming cooldown and level-up notifications.
- Revalidated energy interactive notices and typo suggestion flow; recorded Experimental-Bell feature gap ledger without claiming unverified parity.
- Added Stage 35 regression tests and documentation.

## [2.16.0] - 2026-10-29

### Added
- Stage 30: context-aware recommendation filtering / game request input policy.
- Stage 30 focused verification script and documentation.


## [2.12.0] — Stage 26
- Added per-message correlation envelope and privacy-safe counters.
- Added typed message/command events in the message handler.
- Added Stage 26 verification and full documentation.
## 2.24.1 — Stage 38, Iteration 2 (2026-10-29)
- Added owner moderation commands for timed/permanent bans and automatic expiry cleanup at the central command gate.
- Added owner energy adjustments with atomic ledger persistence and bounded audit history.
- Added safe user data inspection and allowlisted owner metadata (`nickname`, `note`) instead of arbitrary mutation.
- Added `.listbans`, `.listenergy`, stage documentation, and focused runtime tests.
- Cross-referenced Experimental-Bell owner command contracts while preserving Whiskay's plugin/database architecture.

# v2.7.0 — Auto World Boss Tunnel

- `npm start` launches a dedicated TryCloudflare tunnel for the World Boss webhook.
- Added tunnel lifecycle events, bounded exponential retry, local `.env` synchronization, and owner commands `.tunnelstatus` / `.tunnelrestart`.
- Optional GitHub manifest sync updates only `.runtime/whiskay-tunnel.json`; `.env` and secrets are never uploaded.

## 2.6.0 — 2026-10-27
- Added persistent user registry, balance/top-up approvals, anonymous chat, Nexora passive conversation routing, truth-or-dare, experimental button-driven chess, and pairing portal diagnostics.
- Fixed case-sensitive serializer imports and added menu widgets for balance and user counts.

# Changelog

## 2.35.4 — Owner Testcommand delivery and command routing fix (2026-10-31)

- Registered all names actually used by the owner: `.testcommands`, `.testcommand`, `.testcmd`, and `.testcmds`.
- Bare invocation now displays help instead of unexpectedly starting a lengthy `npm ci` and full QA pipeline. The full run requires `.testcommands run`.
- Moved the long runner to a managed background task after an immediate WhatsApp acknowledgement; the bot message handler can continue processing other messages while QA runs.
- Added active-run duplicate protection, a usable status command during QA, phase progress notices, and plain-text fallbacks when interactive message delivery is unavailable.
- Reduced the plugin cooldown to 2.5 seconds; active-run state and the runner's exclusive lock prevent duplicate work rather than blocking status/help behind a 60-second command cooldown.
- Added six plugin behavior tests covering aliases, default help, owner gating, immediate background acknowledgement, duplicate prevention, status during execution, completion delivery, and interactive fallback.
- Focused validation: `npm run verify:testcommand` passed 13/13 tests; 277 JavaScript files passed `node --check`. Full project `verify:all`, live Baileys message delivery, and a real registry-backed `npm ci` were not run in this patch.

## 2.35.4 — Energy middleware regression and documentation correction (2026-10-31)

- Replaced the brittle Stage 32 source-text assertion with behavioral checks for free/zero-cost exemptions, declared paid costs, zero/insufficient balances, exact-balance allowance, and invalid-balance fail-closed behavior.
- Added the shared `canExecuteWithEnergy()` policy and wired it into the energy middleware so malformed ledger/workload values cannot accidentally pass affordability checks.
- Explicit free mode and numeric zero-cost declarations remain exempt; positive static costs remain bounded to 0.05–10 energy points.
- Corrected current README and Stage 31/32 notes: ledger read/write failures stop paid command execution (fail-closed), not fail-open.
- Refreshed stale Stage 34 regression expectations and documentation to match the adaptive Stage 45 cooldown model and weighted workload thresholds; no runtime policy was changed for that cleanup.
- Local verification: Stage 32 regression suite passed 5/5. Full suite and live WhatsApp behavior were not rerun/claimed.

## 2.35.1 — Stage 46 Iteration 2
- Bound `.gitpush` approvals to the exact Git `HEAD` commit as well as staged, unstaged and untracked content, preventing a new local commit from slipping into an earlier approval window.
- Fixed retry after a transport failure: already-created local commits ahead of `origin/main` are now pushed even when the working tree is clean; staged changes are committed only when present.
- Added integration regressions for clean-tree local commits and HEAD changes after analysis. Targeted validation passed 24/24; no reset, stash, workflow rewriting or automatic rebase was introduced.

## 2.33.0 — Stage 44 Iteration 1
- Isolated classic quiz sessions by chat and game type so Tebak Gambar, Tebak Anime, and other quiz modes can run independently without stealing or blocking each other’s timers/polls.
- Added game-specific hint/forfeit/clear targeting and global `.toptebakgambar` / `.toptebakanime` leaderboards.
- Added `serializer.js` poll-upsert normalization for Baileys `pollUpdateMessage`; `serializer-compat.cjs` is intentionally unchanged.
- Fixed poll aggregation to retain the full poll-creation WAMessage, not only its inner message payload.
- Connected quiz victories to the durable Stage 43 leveling store: each game tracks its own wins/XP, and rewards also credit the player’s group leveling profile. Tebak Gambar and Tebak Anime grant 35 XP + 5 coins per win.
- Added regression tests for session isolation, poll routing, full poll message retention, and persisted game-specific rewards.
- Live WhatsApp poll vote delivery/decryption remains a production-session verification item.

## 2.31.0 — Stage 42 Iteration 1
- Fixed World Boss tunnel executable resolution: an invalid/stale `CLOUDFLARED_BIN` now falls through to the architecture-matched bundled binary, `./bin`, and PATH instead of repeatedly spawning a guaranteed-ENOENT path.
- Added actionable cloudflared diagnostics and regression tests for valid fallback and missing-binary cases.
- Documented Baileys LID identity changes, app-state sync missing-key failures, and group sender-key decryption retries. These protocol-level events are not masked or “fixed” by deleting auth keys; operational recovery guidance preserves the linked-device session.
- Live WhatsApp Signal resync/decryption and a real Cloudflare tunnel remain deployment-level checks.


## 2.8.0 — Stage 22 Ops Center
- Added owner-only runtime diagnostics, webhook metrics, public tunnel health probe and no-send dry-run.
- Hardened webhook auth comparison, added per-source rate limiting, payload cap and event deduplication.
- Added optional World Boss group allowlist.

## 2.8.1 — 2026-10-29

- Added owner-only `.testcommands` / `.testcmds` with source syntax audit, Node test-suite log, interactive save/discard confirmation, generated `test/*.test.js`, and README updates on save.
- Fixed `.setmenu order` to show interactive category/A–Z/Z–A options.
- Added `neon` and `zen` menu templates plus Bio Core, events, incoming-message, uptime, and database widgets.
- Corrected command row composition: count → command → access symbols → one energy symbol → optional percentage.
- Added clearly labelled synthetic quoted-message previews using the local `freply.cjs` compatibility layer.
- Made the 16:9 landscape Card V2 the default image mode for new menu settings and documented Baileys quote limitations.

## 2026-10-29 — Access, downloader and documentation maintenance

- Fixed YouTube MP3/MP4 delivery: Baileys socket send API, broader MP4 format fallback, diagnostics and three unit tests.
- Added master stage archive and dated downloader test report while preserving previous documentation and archive copies.

## Stage 23 — 2026-10-29
- Added the first Stage 23 integration foundation: message wrapper/preferences/charging economy and companion sync/visual-state hooks. See `docs/STAGE-23-IMPLEMENTATION-2026-10-29.md` in the bot archive and the corresponding Stage 23 section in the companion docs.

## Stage 23+ Rev. 2 — 2026-10-29
- Memisahkan `ctx.reply(text)` yang khusus teks dari `ctx.send(options)` builder multi-format dan menghubungkannya dengan helper Baileys v7 yang ada.
- Menambahkan pilihan setmenu baterai (font menu saja), notifikasi energi hide/merge/separate, opsi kanvas Menu/Profile V1/V2, dan owner `.setenergy reset [target]`.
- Menambahkan addendum lima literasi dan batasan validasi live.

## [2.10.0] — Stage 24
- Added five-theme terminal logger with hot-read preference and owner-only `.setlog`.
- Added Stage 24 five-literacy implementation record and structural test.


## Stage 25 — 2026-10-29
- Added repository identity placeholders, optional PM2 lifecycle config, Menfess session engine and tests.
- Added Stage 25 architecture documentation and README index.
- Documented production gaps for quote middleware, GitHub webhook/Actions, AI automation, and multi-instance session persistence.


## 2.13.0 — Stage 27 (2026-10-29)
- Added durable event outbox foundation and idempotency-key deduplication.
- Added bounded retries, exponential backoff, dead-letter state, and outbox statistics.
- Added authenticated web event ingestion contract and `event_outbox` SQL table with RLS enabled.
- Added Stage 27 verification commands and five-literacy documentation.
- Deferred live worker dispatch and transactional economy effects until production consumers are idempotent.


## Stage 28 — 2.14.0
- Added event validation/idempotency groundwork and Stage 28 verification.
- Expanded README and stage documentation while preserving prior history.
- Production multi-instance transaction guarantees remain dependent on database integration.


## [2.15.0] - 2026-10-29 — Stage 29
- Added global widget-symbol controls and complete settings summary.
- Added Kawaii, Boxed, Japanese and Developer menu themes.
- Added configurable synthetic contact/product quote preview fields and forwarded-label modes.
- Added owner global recommendation switch, contextual `.explore`, `.imagine`, and `.character`.
- Hid group/broadcast/newsletter identifiers from battery dashboard rows.
- Expanded `.status` and surfaced Mod Coin in player profile.
- Added Stage 29 tests and documentation; see known limitations in `docs/stages/STAGE-29.md`.

## 2.17.0 — Stage 31 (2026-10-29)
- Added bounded per-account Coin Mod transaction history in the existing energy ledger, written atomically with balance changes.
- Added `.modcoin history [nomor/JID]`; account owners can view their own history, and only bot owners can request another account's history.
- Recorded manual owner credits, Fast Charge spends/refunds, and battery-capacity upgrade costs with sanitized reason/reference fields.
- Added Stage 31 regression tests for invalid ledger entries, spend rejection, atomic balance/history persistence, and 100-entry history retention.
- Documented Coin Mod semantics, payment verification limitations, energy formula/limits, and the Stage 31 work-memory rules.


## [2.18.0] — Stage 32 — 2026-10-29
- Added independent widget design presets, energy widget visibility, and configurable page size/unlimited pagination.
- Fixed zero-energy execution for non-recovery commands; recovery commands remain available.
- Added interactive Coin Mod root menu and list-based status controls; reduced quick-reply clutter.
- Added profile widget settings and global owner display defaults.
- Serialized leveling/profile writes to prevent concurrent XP lost updates.
- Added Stage 32 regression tests and documented the actual serializer compatibility path.


## [2.19.0] — Stage 33 — 2026-10-29
- Audited the 106-file Knightbot-MD command directory and compared it against Whiskay's plugin registry to avoid duplicate features.
- Added local Indonesian fun commands: eightball, fact, joke, compliment, flirt, playful insult, quote, shayari, and roseday.
- Added button-driven trivia and solo Tic-Tac-Toe with per-sender session ownership and expiry.
- Added Open-Meteo current weather, MyMemory translation, and Jikan anime/manga search commands with bounded inputs/timeouts.
- Added seven Stage 33 regression tests; documented privacy, provider, licensing uncertainty, excluded feature classes, troubleshooting, and rollback.


## [2.20.0] — Stage 34 — 2026-10-29
- Fixed widget symbol visibility so before/after symbols can be hidden independently without clearing saved values.
- Added deterministic workload classification, preflight energy affordability, low-energy button notice, and persisted Energy Saver below 20% with reduced eligible cost and longer cooldown.
- Added owner-controlled typo suggestion threshold, explicit JobLoader/ChronosCortex, persisted reminders and admin-configurable adzan schedule.
- Added bounded command failure quarantine, NSFW policy/token scaffold (without content generators), and `.bc --preview`.
- Added Event Shell Adapter and Experimental-Bell Feature Gap Ledger; documented compose-not-clone decisions.
- Added Stage 34 regression tests and documentation.

- Added WorkloadTracker interval CPU/heap metrics, deterministic MetaStateCortex health score, and explicit-tag conversation memory decay with `.memory` controls.


## [2.23.0] — Stage 36 revision — 2026-10-29
- Inspected the user-uploaded Experimental-Bell snapshot at file level, including both `helpers/Events/werewolf.js` and the separate `machine/werewolf.js` engine; wrote a command-family parity matrix and Literasi 1–5 audit based on the actual Whiskay tree.
- Added a room-local Werewolf engine and persistent store using Whiskay's serialized app-database mutation path, with player limits, private role delivery, day voting, night role actions and phase resolution.
- Added `.ww` and `.wwpc` plugins; introduced the `werewolfRooms` database namespace without discarding existing records.
- Added Werewolf regression tests and documented unimplemented parity details (timed phases, automatic DM room binding, Mayor vote weighting and Hunter trigger).

## 2.26.7 — Stage 40 Iteration 8

- Added owner-only `.saveimg`, `.saveimage`, `.saveimagepath`, and `.imgsave` to save a replied-to image or an image carrying the command caption into `data/saved-images/` and return its local path.
- Restricts saved image types to JPEG, PNG, WebP, and GIF; enforces a 15 MiB limit, sanitizes filenames, and refuses to overwrite existing files.
- Added regression tests for image-message unwrapping, MIME-to-extension mapping, filename traversal sanitization, and owner-only command registration.
- Continued downloader audit: command registration and adapter contracts are covered by local tests, but live provider endpoints and WhatsApp production delivery remain unverified.

## 2.28.0 — Stage 41 Iteration 2
- Added persistent multiplayer SOS with turn/board validation, score tracking, resign and expiry handling.
- Added multiplayer Ular Tangga with lobby, 2–4 players, dice, snakes/ladders, turn order and expiry.
- Added a minigames directory supporting list, search, category, detail and in-bot launch shortcuts.
- Added Experimental-Bell source-family parity audit and regression tests; documents known unimplemented/unverified provider gaps rather than claiming full parity.

## 2.32.0 — Stage 43 Iteration 1
- Redesigned Official Menu Canvas V1 and V2 as distinct 1200×675 landscape cards; V2 has a dedicated circular avatar/logo frame.
- Added one-tap avatar upload: select the V2 avatar button, then reply to the bot's upload prompt with an image; the bot stores and applies it automatically without a caption or follow-up command.
- Stabilized leveling data paths relative to the project root so launching from a different shell working directory does not silently switch the XP database.
- Added atomic leveling snapshots, previous-generation backup, fsync, cross-process writer lock, corruption quarantine, checksum-verified gzip snapshots at the 1 GiB threshold, and owner `.leveldb` diagnostics/recovery.
- Added Stage 43 regression tests for process-restart persistence, backup recovery, archive creation, and Canvas V1/V2 output.
- Archive snapshots remain recovery copies; active leveling records are intentionally retained in the live file. True cold-storage sharding is not claimed.

## [2.34.0] - 2026-10-30
- Rebuilt adaptive energy estimation around command class, historical p95 runtime, observed response payload, CPU/heap/event-loop pressure, and queue concurrency.
- Added persistent workload telemetry and per-command runtime profiles in `data/workload-tracker.json`.
- Energy notifications now use interactive buttons and report actual charge, measured runtime, payload size, workload class, and saver cooldown details.
- Added owner-bound energy-saver action tokens; unauthorized clicks warn once and permanently block repeat offenders from future saver buttons.
- Saver mode unlocks below 20%, auto-disables at or above 20%, reduces eligible command energy dynamically, and increases cooldown adaptively. Explicitly free commands remain zero-energy while still receiving saver cooldown policy.
- Menu energy labels now distinguish dynamic, static, and zero-cost commands correctly.

## v2.35.4 — Stage 49 Part 2 (2026-10-31)

- Added owner-only cached group previews through `.copymember` and `.copyptpt`.
- Added private-chat-only `.groupinvite <GROUP_ID>` to create a destination-group invitation link from cached metadata.
- Added strict group JID/invite-code validation and consent-focused safeguards; no silent participant harvesting or bulk adding is performed.
- Added `npm run verify:stage49-part2` and three focused automated tests.
- Detailed implementation: `docs/STAGE-49-PART-2.md`; test report: `docs/reports/stages/STAGE-49-PART-2-TEST-REPORT.md`.

## [2.35.4] — Stage 49 Part 3
- Added bounded fair WorkloadScheduler with global/per-lane concurrency, queue limits, pause/resume and shutdown behavior.
- Added owner-only `.workload` monitor and controls.
- Added scheduler regression tests and operational documentation.

## [2.35.4] — Stage 49 Part 4
- Strengthened the existing schema-v3 leveling ledger and added storage health counters.
- Added activity-class XP weights, per-command cooldown, daily XP cap, and successful Nexora conversation XP.
- Added Energy Canvas V1 and four notification presentation modes (`hide`, `merge`, `separate`, `card`).
- Added independent per-user energy/XP notification and XP menu-widget switches.
- Preserved existing user preferences when owner changes global defaults; only the owner's override is cleared.
- Added deterministic local Bio Core telemetry policy without external model dependencies or sentience claims.

## [2.35.4] — Stage 49 Part 5

- Fixed the poll decryption prerequisite by wiring socket `getMessage` to the internal bounded message store.
- Retained outgoing poll creation WAMessages for Baileys vote decryption.
- Hardened poll upsert normalization so ciphertext is not misclassified as decrypted vote data.
- Added Part 5 regression tests and documentation.

## 2026-10-31 — Owner Full Testcommand QA Upgrade

- Rebuilt `.testcommands` as an owner-only full verification orchestrator: isolated `npm ci`, recursive first-party syntax audit, `npm run verify:all`, and `npm test`.
- Added a disposable sandbox so installing dependencies and running regression tests do not replace the live bot's `node_modules` or operate on its WhatsApp sessions and user database.
- Added automatic failure ZIP diagnostics with phase logs, TAP failure excerpts, exact source file/line/column references, numbered source context, and package metadata.
- Added one dedicated last-success report at `test/reports/WHISKAY-VERIFY-SUCCESS.md`, written only after every release gate passes.
- Added `verify:testcommand` and focused regression coverage for path parsing, summaries, secret redaction, sandbox exclusions and ZIP integrity.


## 2026-10-31 — Testcommand Interactive Control Center

- Replaced text-only `.testcmd` help with a complete WhatsApp native-flow QA Control Center.
- Added quick replies for Start Full QA, Status QA, and Success Report.
- Added contextual buttons to status, report, unknown-action, duplicate-run, start acknowledgement, and final-result messages.
- Expanded help content with all pipeline phases, report/diagnostic locations, security boundaries, sandbox behavior, and operational caveats.
- Preserved plain-text fallback when interactive transport is unavailable.
- Added regression coverage for interactive payloads and contextual button navigation.


## 2026-10-31 — QA diagnostic delivery and regression repair
- Added one-tap WhatsApp document delivery for the latest diagnostic ZIP.
- Fixed isolated test environment setup, group metadata cache-miss handling, and grouphelp registration.
- Disabled automatic commit/push behavior in legacy metrics/history workflows; both are manual and read-only.
- Updated stale regression assertions and missing documentation/environment-template references.
- Aggregated nested TAP summaries for verify:all and removed fabricated Meta AI forwarding attribution from native-flow messages.

## 2026-10-31 — Scoped npm test discovery and status-card cleanup

- Routed `npm test` through `scripts/run-tests.mjs`, which discovers tests only under `test/` and passes explicit test paths to Node.
- Added enforced `.testignore` exclusions for `sessions/`, `node_modules/`, `.git/`, runtime/cache/build folders, generated reports, and symlinks.
- Redirected test session/data/temp environment paths to an OS temp directory and clean it after test process completion.
- Documented that `node_modules/` remains available only for dependency imports; it is never scanned or mutated by `npm test`.
- Removed duplicate `📊 WHISKAY QA STATUS` and duplicate no-active-run text from the interactive status card.
- Added regression tests for discovery boundaries, symlink handling, and safe argument forwarding.


## [2.35.8] — Stage 51 Part 4: WhatsApp Adzan Audio

- Added local MP3 resolver for `subuh.mp3` and `umum.mp3`, configurable through `ADZAN_AUDIO_DIR`.
- Personal scheduler sends WhatsApp audio with prayer caption; text fallback is used when audio is missing or audio delivery fails.
- Added per-user `.adzan audio on/off/status` preference, persisted in the protected Adzan profile store.
- Added file size/type checks (20 MB maximum), setup documentation, and audio integration tests.
- No copyrighted audio is bundled; operators must provide recordings they are authorized to distribute.


## [2.35.9] — Stage 51 Part 5: Adzan Delivery Reliability & Control Center

- Replaced pre-send at-most-once claims in the personal scheduler with a durable pending-delivery outbox stored in `data/adzan-profiles.json`.
- Added bounded retry delays (1, 5, 15, and 30 minutes), five-attempt maximum, persisted error details, and dead-letter status.
- Scheduler now recovers queued notifications after process restart and accepts a 10-minute prayer-event grace window to cover brief downtime.
- Added aggregate outbox metrics and owner-only `.adzan admin` diagnostics for database, audio readiness, queued, delivered, and permanently failed counts.
- Added `.adzan audio check` alias and reliability tests for retry, dead-letter handling, and owner access control.
- Delivery is at-least-once; a crash after remote acceptance but before local success persistence can result in a duplicate. Live WhatsApp behavior remains unverified by mock tests.

## [2.35.10] — Stage 51 Part 6 — Adzan Dashboard & User Experience

- Added per-user calculation presets: Indonesia reference, MWL, and Egyptian.
- Added bounded per-prayer minute corrections (-30 to +30 minutes).
- Added default/custom local audio pack selection.
- Added personal delivery history and dashboard shortcuts.
- Added validation and focused tests for isolation and settings.

## 2.35.16 — Stage 53: GitHub-Safe Upload & Runtime Data Isolation (2026-11-01)

- Ignore all root/nested `data/`, `sessions/`, `session/`, Baileys/WhatsApp Web auth stores, private env/package credentials, common credential JSON exports, database sidecars, keys, backups, logs and generated QA output.
- Move the static dungeon definition to `assets/dungeon/floors.json`; no `data/` path is exempt from ignore policy.
- Untrack previously tracked databases, session stores, `.env` and credential files with bounded `git rm --cached` batches while preserving local files; local-only security-block reports remain available for review.
- Replace direct-main upload with timestamped `upload/*` branches and automated PR creation.
- Run `npm ci`, syntax validation and `npm test`; preserve local QA failures in redacted reports and submit the branch unless a secret/private-data guard blocks it.
- GitHub Actions repeats validation, uploads log/test artifacts and opens/updates a detailed issue for failures.

## [2.35.17] - 2026-11-02 — Stage 54 Repository Integrity

- Added `scripts/repository-integrity.mjs` to audit relative imports and package-lock metadata without network access.
- Added `npm run audit:repository` and `npm run verify:stage54`; integrated Stage 54 into `verify:all`.
- Classified archived `.patch` files under `docs/archive/patches/` as local-only because historical diffs can contain credential-like fixtures or real secrets.
- Added the patch archive path to `.gitignore` and both runtime/index and upload path guards; local copies are retained on the operator's machine and are not included in distributable source archives.
- Removed the known `whiskay-local-fix-1.patch` from this clean distribution after confirming its synthetic API-key fixture triggered the broad secret detector.

## v2.35.18 — Stage 55 (2 November 2026)
- Added static plugin/command intelligence audit for duplicate command candidates, unreadable metadata, and handler detection advisories.
- Git upload now halts immediately on base-branch merge conflicts, preserving local work and producing a local-only diagnostic report instead of continuing QA/publish on an unsynchronized branch.
- Whitespace validation is scoped to changed executable/configuration files; historical Markdown and vendored files no longer block unrelated uploads. New conflict markers remain blocked.
- Added `audit:plugins` and `verify:stage55` npm scripts.


## v2.35.19 — Stage 56: Git History & Move Intelligence (2026-11-02)
- Added `scripts/git-upload-intelligence.mjs` to inspect pending commit history and staged/unstaged rename/deletion transitions.
- Detects legacy root `*.sh` files whose canonical counterpart exists in `scripts/`; auto-reconciles only when normalized content similarity is at least 72%.
- Removes the obsolete root copy from the index/worktree only for a high-confidence duplicate; ambiguous pairs are preserved and block upload for manual review.
- Runs reconciliation before secure snapshots and publish, then verifies that no duplicate root shell-script path remains after staging.
- Added Stage 56 fixture-based tests covering safe rename recognition and non-destructive ambiguity handling.

## v2.35.20 — Stage 57: Git Commit Lineage & Recovery Intelligence (2026-11-02)
- `git upload` now resumes the currently checked-out `upload/*` branch after interruption, preserving its snapshot commits and avoiding duplicate upload branches; new uploads still start from `main` only.
- Added read-only commit-lineage analysis for merge-base, ahead/behind counts, and patch-equivalent commits already represented in the base branch.
- Recovery analysis runs before snapshot and after base synchronization; no reset, rebase, amend, force-push, cherry-pick, or automatic commit deletion is performed.
- Fixed Stage 53 dungeon definition test: ignored local legacy files under `data/` may remain on the owner's machine; the test now asserts that Git does not track the private path.
- Added `audit:git-recovery` and `verify:stage57`; integrated Stage 57 into `verify:all`.


## [2.35.23] — Stage 58 Part 1: Outbound Traffic Safety & Command Containment (2026-11-08)

- Added a shared `OutboundTrafficGuard` to primary and Jadibot Baileys sockets. Both `sendMessage` and `relayMessage` are routed through bounded workers, per-recipient lanes, global pacing, rolling rate ceilings and same-recipient duplicate suppression.
- Extended `WorkloadTracker` with a deterministic outbound-risk score using recent volume, recipient pressure, failure ratio and queue depth. Outbound history persists only short one-way hashes, source labels and timestamps; writes are batched and flushed at shutdown.
- Fixed a command-dispatch flaw: primary and Jadibot `fromMe` messages are ignored before command parsing. Removed the unprefixed egg-calculator shortcut that bypassed CommandHandler middleware.
- Added a second explicit opt-in (`WHISKAY_AI_PRIVATE_AUTO_ENABLED=true`) for private AI auto-response. Legacy `AI_CHAT_MODE` values alone no longer activate private auto-response; default is mention-only.
- Rebuilt `.bc` around explicit recipient allowlists, preview tokens, confirmation, target ceilings, slower delivery, one active campaign and cancellation. Failed acknowledgement cannot leave a phantom RUNNING campaign.
- World Boss webhook now requires stable event IDs and an explicit group allowlist; an empty allowlist fails closed. TEAMDROP no longer silently sends to the bot's own JID when a recipient is missing.
- Made `.testcommands run` silent, including duplicate run attempts and generic XP/level-up notifications. All progress is local; `.testcommands status` is a manual poll. The plugin bypasses its ordinary cooldown so the owner can poll without a cooldown response.
- Moved four unreferenced `.pre-*` source snapshots from active `src/` into `docs/archive/source-snapshots/`, preserving exact bytes and SHA-256 hashes.
- Added Stage 58 focused regression tests and integrated `verify:stage58` into `verify:all`. See `docs/STAGE-58-OUTBOUND-TRAFFIC-SAFETY.md` and `docs/reports/TEST-REPORT-STAGE-58-OUTBOUND-TRAFFIC-SAFETY.md`.

## [2.35.22] — Git Upload QA & Supply-Chain Hotfix (2026-11-02)

- Added the missing intelligence and recovery modules to the temporary Git Upload fixture and the intelligence module to Stage 46 auto-push fixtures.
- Corrected the Stage 52 patch-archive test so it validates the Stage 54 local-only ignore policy instead of requiring a secret-like patch file to exist in clean CI.
- Updated Stage 52 QA report handling to assert that `data/test-reports/` is ignored and untracked while preserving existing operator ZIP/Markdown reports on disk.
- Dry-run skips only the publish-only empty-PR lineage gate; it still performs QA/report generation and never commits or pushes.
- Added a hash-guarded cleanup script for six confirmed obsolete root/source backup blobs; it removes only exact known Git objects and keeps modified local copies for manual review.
- Recorded `scripts/git-upload.sh` as executable (`100755`) and disabled pagers/interactive Git prompts in both upload scripts.
- Pinned `cacheable` and `@cacheable/utils` to unaffected 2.5.0 tarballs with matching lockfile integrity metadata and npm overrides.
- Improved Git Upload diagnostics to parse compact test totals, capture `[FAIL]` progress, include nested `failures.md`, and retain npm audit logs.
- Added security/report regression tests and enforced High/Critical npm audit in GitHub CI. A clean-runner full-suite pass remains the gate before Stage 58.

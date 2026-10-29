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

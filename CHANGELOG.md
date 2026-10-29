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

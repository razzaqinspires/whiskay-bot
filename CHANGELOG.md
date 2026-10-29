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

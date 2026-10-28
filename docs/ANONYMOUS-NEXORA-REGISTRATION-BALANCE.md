# WHISKAY v2.6 — Nexora, Anonymous Chat, Registration & Balance

## User registry and data durability
- Every observed sender in private chats and groups is recorded with `registered:false` until `.daftar`.
- `src/lib/app-database.js` stores users, balances, top-up transactions, anonymous queue/pairs, games, warnings, and ban state in `data/app-database.json`.
- Writes are serialized, written to a temporary file, and atomically renamed. The previous database is copied to `.bak`; reads recover from that backup when the primary JSON is invalid.
- Keep `data/` on persistent storage and back it up. A single local JSON file is appropriate for one process; multiple replicas need a shared transactional DB (PostgreSQL/SQLite with locking).

## Commands
- `.daftar`, `.register`, `.statusdaftar`
- `.saldo`
- `.topup 10000` (creates pending transaction; owner verifies actual payment)
- `.topuppending` and `.topupapprove REF` (owner only)
- `.anon start`, `.anon next`, `.anon status`, `.anon stop`
- `.truth`, `.dare`, `.tod`
- `.catur @opponent`; `.catur accept ID`; board controls use single-select square lists.

## Nexora conversation layer
The message handler first recognizes a prefixed command and sends it to the existing command loader. Non-prefixed messages are considered for Nexora separately:
- private chat: auto-reply by default after registration;
- group chat: only a mention or reply to the bot triggers AI by default;
- `AI_CHAT_MODE=off|auto|auto-private-mention-group|mention-only`.
Anonymous chat relay takes precedence so anonymous messages are not also sent to the AI provider.
The system prompt presents Nexora as an AI assistant from Razzaq Ventures, but does not claim real artificial consciousness, AGI, feelings, or autonomous learning that is not implemented. Short-term conversational history is not equivalent to model training.

## Pairing portal and payment
New Jadibot rentals for non-owner users require active premium plus enough balance. Initial rental cost is charged from balance; renewal `.perpanjang [days]` also charges balance. `.topup` remains manual: a pending request is not money received and balance increases only after owner verification. The pairing confirmation is still sent through WhatsApp, and users should check that chat for status/code.
`JADIBOT_PUBLIC_URL` must point to the portal server itself or to an HTTPS reverse proxy forwarding both `GET /pair/*` and `POST /api/pair/*` to the Node process on `JADIBOT_PORT`. A normal website URL (including a Vercel static/frontend URL) is not automatically a proxy for the bot process. The UI now explains the `Failed to fetch` case instead of showing only a generic browser error.

## Chess limitations
The initial chess module has user-bound interactive controls, turn validation, basic movement validation, and a three-warning block policy for outsiders. It is a learning/preview engine, not a full tournament engine: check/checkmate, castling, en passant, repetition, and full draw rules are not implemented. Do not use it for ranked competition until a maintained chess engine is integrated.

## Tests and manual validation
Added tests cover database registration, atomic balance/top-up behavior, anonymous pairing and stop, balance underflow prevention, registration gating, AI trigger routing, and chess button access checks.
Manual tests still required: live Baileys login, multi-device button rendering, public HTTPS reverse proxy, payment receipt verification, and anonymous relay with two real test accounts.

## Baileys upstream notes reviewed on 2026-10-27
- Official repository: https://github.com/WhiskeySockets/Baileys
- Issue #2850 reports accounts being blocked after bulk messaging. This is why this revision does not add stealthy mass-add/broadcast behavior or random delays intended to evade anti-spam detection.
- Issue #2871 asks whether Baileys is being phased out of maintenance. The current project pins `@whiskeysockets/baileys` to `7.0.0-rc14`; do not upgrade blindly. Run the project's integration tests and check the official v7 migration guide before changing versions.
- Downloader modules already use `yt-dlp` for YouTube search/download and a configurable `MEDIA_DOWNLOADER_API_URL` for TikTok/Instagram/Facebook. The external provider URL must return JSON containing a supported media URL; public media URLs are validated as HTTP(S). The downloader API is not bundled with the bot.

## GitHub update timestamp
The `repo-update-history.yml` workflow now falls back to the pushed commit's committer timestamp when the event payload has no `head_commit.timestamp` (e.g. manual workflow dispatch), and uses runner UTC only as a final fallback.

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

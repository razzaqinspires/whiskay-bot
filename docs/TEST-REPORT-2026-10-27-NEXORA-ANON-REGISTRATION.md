# Test report — 2026-10-27

## Automated checks
- JavaScript syntax check: 122 `.js`/`.cjs` files checked, 0 syntax failures.
- `npm test`: 66 tests passed, 0 failed, 0 skipped.
- New coverage includes observed users remaining unregistered until `.daftar`, explicit registration, pending top-up approval/idempotency, balance underflow, anonymous queue/pair/stop, JSON backup recovery, registration gate, passive AI trigger policy, chess session access checks, and downloader provider fallback validation.
- Existing regression tests cover the menu, Canvas V2, pairing portal, RPG economy/sync, downloader URL validation, and previous bot features.

## Not verified against live services
- A clean `npm ci` / full runtime boot in this sandbox (dependency `dotenv` is absent from this extracted source workspace).
- Real WhatsApp connection, public HTTPS proxy for the pairing portal, actual QR/pairing confirmation, and a real top-up receipt.
- Two real WhatsApp accounts for anonymous chat and chess buttons.
- Live AI API calls with valid provider credentials.
- Download provider availability and real media delivery.

## Known limitations
- Chess is experimental: validates basic piece movement and button/session ownership, but does not implement check/checkmate, castling, en passant, repetition/draw rules, or a full chessboard PNG.
- The local JSON database uses a serialized single-process writer, atomic temp-file rename, and `.bak` recovery. It is not a multi-instance database; use SQLite/PostgreSQL for multiple replicas.
- Pairing portal `JADIBOT_PUBLIC_URL` must serve/proxy `GET /pair/*`, `POST /api/pair/*`, and `/healthz` to the portal Node process. A generic frontend domain alone is insufficient.
- Top-up is manual verification; pending payment never increases balance until owner approves after confirming funds.
- Nexora is an AI assistant and does not claim real artificial consciousness or self-training.

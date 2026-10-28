# Change log — 2026-10-25

**Package version:** `2.5.0` (feature release).

## Fixed: Pairing button no longer asks for a phone number inside WhatsApp buttons

- Changed `.jadibot pairing` to create a one-use CTA URL to a responsive mini-web form.
- Added `.jadibotconfirm <token>`; after the number is submitted, the user returns to the main bot using a WhatsApp deep link. The user must send the prefilled confirmation message manually, then pairing code is delivered inside WhatsApp.
- Added ticket ownership validation, a 10-minute TTL, international phone format validation, one-submit behaviour, no-store responses, CSP/referrer headers, request-size cap, and session storage isolation.
- Added dynamic host detection: local development tries a temporary TryCloudflare quick tunnel; configured public URLs and detected deployment/server environments skip tunnel use by default.
- Added optional cloudflared auto-download for supported Linux architectures (amd64, arm64, arm) from the official GitHub release URL.
- Added a recurring expiry worker to stop sub-bot sockets after rental expiration and notify the user best-effort.
- Preserved existing QR terminal mode, direct phone pairing fallback, rental commands, configurable duration/price, and manual payment approval flow.

## Added: GitHub tools and timestamped repository metrics

- Added `.github`, `.githubstats`, `.github commits`, `.github issues`, and `.github workflows` commands.
- Added a scheduled GitHub Actions workflow that refreshes public repo metrics and optional 14-day traffic, appends a bounded history, generates Mermaid charts, and updates only a marked section in the root README.
- Preserved the source-update history workflow. Added architecture mapping, deployment/security instructions, and test results to `docs/` and linked them from `README.md` and `docs/README.md`.

## Configuration/documentation

- Added `JADIBOT_*`, `BOT_WHATSAPP_NUMBER`, and `WHISKAY_GITHUB_*` entries to `.env.example`.
- No production secrets, session files, payment account numbers, or live pairing codes belong in source control or release ZIPs.
- This record describes source-level implementation; real-device WhatsApp login and deployment verification are tracked separately in `TEST-REPORT-2026-10-25.md`.

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

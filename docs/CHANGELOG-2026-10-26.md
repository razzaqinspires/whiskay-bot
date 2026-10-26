# Changelog — 2026-10-26

## Stage 2: Pairing portal hardening (2.5.1 target)

- Rate-limited pairing form submissions to reduce abuse and repeated pairing attempts.
- Rejected unsupported content types and oversized request payloads early.
- Added security headers to JSON API responses.
- Added automated CI workflow for syntax and regression tests.
- Added a regression test for rate-limit behavior and documented deployment limits.
- Preserved the previous QR/pairing flow, owner/premium access checks, pricing controls, GitHub command plugin, and existing documentation archive.


## Stage 3 — Group control and RPG/AI refinements
- Added owner-only `.groupbot` controls with per-group mute, status/list, only-current-group mode, and reset buttons.
- Added opt-in `.antitoxic`, `.antibanword`, and `.textguard` group filters with persistent group-scoped settings.
- Added cached group metadata role resolution for admin/bot-admin checks.
- Added `.rpg coach` tactical recommendations and bounded AI consistency/uncertainty guidance.
- Full regression suite after this stage: 65 passed, 0 failed; syntax checks passed. Live WhatsApp integration remains to be verified on a test group. If group metadata cannot be fetched, automatic text moderation fails open to avoid false-positive deletion.

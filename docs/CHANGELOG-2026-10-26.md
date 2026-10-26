# Changelog — 2026-10-26

## Stage 2: Pairing portal hardening (2.5.1 target)

- Rate-limited pairing form submissions to reduce abuse and repeated pairing attempts.
- Rejected unsupported content types and oversized request payloads early.
- Added security headers to JSON API responses.
- Added automated CI workflow for syntax and regression tests.
- Added a regression test for rate-limit behavior and documented deployment limits.
- Preserved the previous QR/pairing flow, owner/premium access checks, pricing controls, GitHub command plugin, and existing documentation archive.

## Stage 3: Egg calculator and group feature completion (2.5.2)

- Documented `.telur`, `.kalkulatortelur`, `.hitungtelur`, `.egghelp`, and the `EGG_CALCULATOR_URL` deployment contract.
- Updated `.env.example` with the calculator website URL setting and optional GitHub traffic configuration; removed duplicate Jadibot example entries.
- Added per-group persistent settings for anti-link, anti-spam, and welcome/leave notices.
- Added `.grouphelp`, `.groupinfo`, `.admins`, `.tagall`, `.hidetag`, `.revoke`, `.setsubject`, `.setdesc`, `.closegroup`, `.opengroup`, `.antilink`, `.antispam`, `.welcome`, and `.setwelcometext`.
- Added group message guard and group participant event hook.
- Hardened group moderation permission checks by reading actual group metadata rather than relying on an absent `ctx.isAdmin` flag.
- Fixed case-sensitive serializer facade imports and exposed compatibility aliases `serializeMessage` / `attachSerializerRuntime`.
- Updated the root README, documentation index, architecture map, and dedicated feature docs without removing historical archives.

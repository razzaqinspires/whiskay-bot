# Changelog — 2026-10-26

## Stage 2: Pairing portal hardening (2.5.1 target)

- Rate-limited pairing form submissions to reduce abuse and repeated pairing attempts.
- Rejected unsupported content types and oversized request payloads early.
- Added security headers to JSON API responses.
- Added automated CI workflow for syntax and regression tests.
- Added a regression test for rate-limit behavior and documented deployment limits.
- Preserved the previous QR/pairing flow, owner/premium access checks, pricing controls, GitHub command plugin, and existing documentation archive.


## v2.5.5 — Egg calculator, menu presets and serializer compatibility
- Added a single-select transaction preset list, manual input and Canvas result receipt to the egg calculator.
- Added six menu themes with explicit confirmation before presentation settings are replaced.
- Reorganized menu settings into named categories, added widget symbols and safe quote modes.
- Extended native-flow response parsing and added Baileys issue review documentation.
- Updated README and added unit tests for calculations and menu structure.

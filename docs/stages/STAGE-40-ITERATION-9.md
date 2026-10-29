# Stage 40 — Iteration 9 (v2.26.8)

## Scope

- Continue the Experimental-Bell downloader parity audit with bounded YouTube search inputs and regression tests for platform host validation.

## Changes

- YouTube search terms are whitespace-normalized and limited to 200 characters before they are passed to `yt-dlp`.
- Empty queries are rejected with a clear Indonesian error.
- Inactive YouTube search sessions expire after 30 minutes. Expired sessions are pruned when a new search session is saved; the session map remains capped at 100 entries.
- Added tests rejecting lookalike Instagram/YouTube domains and unsupported platform hosts.
- Updated README, changelog, package version, and Stage 40 verification documentation.

## Verification

See [Test Report — Stage 40 Iteration 9](TEST-REPORT-STAGE-40-ITERATION-9.md).

External downloader providers and production WhatsApp delivery are not verified by offline tests.

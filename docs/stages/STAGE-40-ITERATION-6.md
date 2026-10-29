# Stage 40 — Iteration 6

## Scope

Harden shared downloader selection state and provider response contracts without removing existing command adapters.

## Changes

- Selection tokens are bound to the original sender and chat. An unauthorized attempt no longer deletes the valid token.
- Authorized tokens are still single-use and expired tokens are removed.
- Pending selection state is cleaned during insertion and capped at 2,000 entries to prevent unbounded growth during provider outages or command bursts.
- Provider JSON must be an object, not an array or primitive, before media fields are read.
- Added regression tests for token ownership/single-use behavior and malformed provider JSON.
- Updated package version to 2.26.5 and refreshed README/changelog.

## Validation boundary

Automated tests use a mocked provider response. Live third-party endpoints and actual WhatsApp media delivery are not covered by this iteration. DNS rebinding protection is still not implemented; use network egress controls for production SSRF defense.

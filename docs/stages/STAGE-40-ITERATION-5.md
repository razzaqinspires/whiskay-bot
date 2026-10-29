# Stage 40 — Iteration 5: Provider URL Hardening

## Scope

Harden the shared downloader provider response path before returned media URLs are handed to Baileys for fetching. This iteration does not change the external provider API contract or add new provider dependencies.

## Changes

- Added `normalizeProviderMediaUrl()` for provider-returned video, audio, and thumbnail URLs.
- Rejects `localhost`, `.localhost`, `.local`, and `.internal` hostnames.
- Rejects private/reserved IPv4 literals, IPv6 loopback/unique-local/link-local/multicast literals, and private IPv4-mapped IPv6 literals.
- Sanitizes control characters and repeated whitespace in provider-supplied titles before they appear in chat UI.
- Added tests for local/private URL rejection and public CDN compatibility.

## Security limitation

The validator does not resolve DNS names. A hostile provider hostname that resolves to a private IP could still bypass this hostname-only check. Use trusted provider endpoints and network-level egress controls; do not treat this change as a complete SSRF defense. Public media URLs can be HTTP or HTTPS for compatibility with existing providers.

## Verification

See `TEST-REPORT-STAGE-40-ITERATION-5.md`. External provider endpoints and live WhatsApp delivery were not tested.

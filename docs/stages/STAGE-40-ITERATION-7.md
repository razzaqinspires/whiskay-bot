# Stage 40 — Iteration 7

## Scope

Harden downloader provider response parsing and preserve valid selection tokens when users choose a format not returned by the provider.

## Changes

- Provider response bodies are limited to 1 MiB before JSON parsing. Streaming responses are read incrementally and cancelled when the cap is exceeded; `Content-Length` is checked when available.
- `takePending(token, sender, chat, format)` validates sender, chat, expiry, and format availability before consuming the one-time token.
- `.dlselect` passes the requested format to token validation so an unavailable/forged format cannot invalidate a user's legitimate selection.
- Regression tests cover oversized provider responses and unavailable-format token preservation.

## Verification

Run `node --test test/stage40-downloader-parity.test.js`. Live provider API, DNS resolution/SSRF network policy, and WhatsApp production delivery must be tested in deployment.

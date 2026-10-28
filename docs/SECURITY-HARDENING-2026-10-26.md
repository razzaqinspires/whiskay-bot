# Stage 2 — Jadibot Portal Security Hardening

**Date:** 2026-10-26  
**Version target:** 2.5.1  
**Scope:** Public pairing portal, request throttling, CI regression checks, and documentation.

## Changes

- Added in-memory per-IP sliding-window throttling to the pairing phone submission endpoint: maximum 8 attempts per 10 minutes per process/IP.
- Added `Retry-After` and HTTP `429` response for rate-limited requests.
- Enforced JSON content type and a declared payload-size cap before parsing request data; the streaming parser retains its own 4 KiB cap.
- Added security headers to JSON responses: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and restrictive JSON `Content-Security-Policy`.
- Periodic cleanup now also expires old in-memory rate-limit buckets. IPs are not persisted or written to logs.
- Added a GitHub Actions CI workflow to run Node 20, `npm ci`, JavaScript syntax checks, and `npm test` on pushes and pull requests.
- Added regression coverage for rate-limit threshold and expiry.

## Operational notes and limits

- The rate limiter is process-local and resets on restart. If the portal is horizontally scaled or deployed behind multiple workers, add a shared rate limiter at the reverse proxy or use a shared datastore.
- When behind a proxy, `req.socket.remoteAddress` may be the proxy address. Configure rate limiting at the trusted edge if multiple clients share that proxy. The app deliberately does not trust arbitrary `X-Forwarded-For` headers.
- Keep `data/jadibot/`, `sessions/`, and `.env` private. Use persistent disk for Baileys credentials.
- Pairing must be initiated only for a WhatsApp account the user owns or is authorized to manage. Never expose pairing codes on the public web page.
- CI tests cannot prove real WhatsApp pairing, a live TryCloudflare tunnel, reverse-proxy TLS, or a successful GitHub Actions run on the remote repository. Those require deployment-side verification.

## Verification record

- `npm test`: **48 tests passed, 0 failed** (local run in the packaged source tree).
- `node --check` over all JavaScript files under `src/` and `test/`: run as part of CI command and locally before packaging.
- ZIP integrity: checked after packaging.
- Live WhatsApp account, public HTTPS URL, tunnel and remote CI: **not run from this local environment**.

## Rollback

Revert the `src/services/jadibotPortal.js`, `test/jadibot-portal.test.js`, and `.github/workflows/ci.yml` changes. No database schema migration is required.

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

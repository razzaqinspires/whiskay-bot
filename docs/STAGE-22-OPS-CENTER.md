# Stage 22 — Ops Center & Webhook Hardening

## Commands (owner only)
- `.opsstatus`: runtime, memory, CPU/load and tunnel status.
- `.webhookstats`: in-process request/event counters and deduplication counters. Counters reset on restart.
- `.tunnelhealth`: probes the public `/healthz` route.
- `.webhookdryrun`: checks configuration without sending WhatsApp messages.
- Existing `.tunnelstatus` and `.tunnelrestart` remain available.

## Webhook safety
- Bearer token comparison uses constant-time comparison.
- Global per-source request rate limiting; default 12/minute, configurable via `WHISKAY_WEBHOOK_RATE_LIMIT`.
- Optional `eventId` deduplication prevents retries from re-broadcasting the same successfully delivered event (in-memory, reset at restart). If WhatsApp is unavailable, the ID is not marked complete so a retry can work.
- Payload capped at 8 KiB.
- Optional `WHISKAY_BOSS_TARGET_GROUPS` comma-separated group JIDs limits announcements to selected groups. When empty, legacy behavior broadcasts to all participating groups; set an allowlist for production.
- `GET /healthz` exposes only a minimal liveness response; no secrets or URLs are included.

## Run checks
```bash
npm install
npm run verify:ops
npm test
npm start
```

Quick Tunnels are temporary and have no uptime guarantee. The URL manifest is public and contains only the endpoint; never place credentials in it. GitHub sync requires a fine-grained token with Contents: Read and write on the two intended repositories.

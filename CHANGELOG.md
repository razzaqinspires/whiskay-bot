# v2.7.0 — Auto World Boss Tunnel

- `npm start` launches a dedicated TryCloudflare tunnel for the World Boss webhook.
- Added tunnel lifecycle events, bounded exponential retry, local `.env` synchronization, and owner commands `.tunnelstatus` / `.tunnelrestart`.
- Optional GitHub manifest sync updates only `.runtime/whiskay-tunnel.json`; `.env` and secrets are never uploaded.

## 2.6.0 — 2026-10-27
- Added persistent user registry, balance/top-up approvals, anonymous chat, Nexora passive conversation routing, truth-or-dare, experimental button-driven chess, and pairing portal diagnostics.
- Fixed case-sensitive serializer imports and added menu widgets for balance and user counts.

# Changelog


## 2.8.0 — Stage 22 Ops Center
- Added owner-only runtime diagnostics, webhook metrics, public tunnel health probe and no-send dry-run.
- Hardened webhook auth comparison, added per-source rate limiting, payload cap and event deduplication.
- Added optional World Boss group allowlist.

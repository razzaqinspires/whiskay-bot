# Stage 21 — Auto World Boss Tunnel

## What changed
- `npm start` now starts a second Quick Tunnel for the World Boss webhook on `WHISKAY_BOT_WEBHOOK_PORT` (default `8787`) while the existing Jadibot portal tunnel remains separate.
- Tunnel URL discovery uses emitted lifecycle events and a retry loop with bounded exponential backoff.
- On URL discovery, the service updates the local bot `.env` and the sibling RPG project's `.env` with `WHISKAY_BOT_WEBHOOK_URL`. It also writes `.runtime/whiskay-tunnel.json` in both project folders.
- `.tunnelstatus` reports status. `.tunnelrestart` is owner-only.
- Optional GitHub manifest sync updates `.runtime/whiskay-tunnel.json` in both repositories. It never uploads `.env` or any secret.

## Setup
1. Keep both project folders adjacent, e.g. `whiskay-bot/` and `whiskay-rpg-companion/`. Otherwise set `WHISKAY_RPG_PROJECT_DIR` to the RPG project path.
2. Add to `whiskay-bot/.env`:
   `WHISKAY_WEBHOOK_TUNNEL_ENABLED=true`
3. `npm start` is the only command needed to start the bot and its webhook tunnel. Keep the process running.
4. The URL is temporary and may change after restart; local `.env` files are rewritten automatically.
5. Optional GitHub manifest sync: set `WHISKAY_GITHUB_SYNC_TOKEN` (sync is on by default; set `WHISKAY_TUNNEL_GITHUB_SYNC=false` to disable it) to a dedicated GitHub PAT with Contents read/write access to both repositories. Configure repository names if different. Do not use a traffic-only/read-only token.

## Important limitations
- GitHub sync only publishes the public URL manifest. It does not upload `.env`, tokens, or secrets.
- Updating a local `.env` does not automatically update Vercel's Environment Variables. To make a Vercel deployment follow a changing Quick Tunnel URL, configure Vercel API automation separately or use a stable named Cloudflare Tunnel/custom hostname. Free Quick Tunnels are temporary and not guaranteed stable for production.
- Keep the webhook secret identical between the bot and RPG/Vercel environment. Never put it in the manifest or GitHub.
- A valid `world_boss_spawned` event broadcasts to every WhatsApp group the bot participates in. Do not use a valid event for connection-only testing.

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

# Stage 18 — Bot implementation & audit

## Scope
- Rebuilt this project's README with bot-specific branding, actual plugin command catalog, Smart Energy heuristic explanation, worker metrics, Mermaid message flow, and a repository-relative Markdown index.
- Added `.auction sell`, `.auction list`, `.auction buy`, and `.auction help` to call the website's authenticated auction API.
- Added an HTTP webhook at `POST /webhooks/world-boss`; it validates a shared bearer secret, accepts only `world_boss_spawned`, and sends a fixed message to participating WhatsApp groups.

## Required configuration
Set `DUNGEON_WEBSITE_URL`, `DUNGEON_SYNC_TOKEN`, `WHISKAY_BOSS_WEBHOOK_PORT`, and `WHISKAY_BOSS_WEBHOOK_SECRET`. Expose the webhook only behind HTTPS and firewall restrictions. The webhook should not be reachable through an untrusted plain HTTP network.

## Verification boundaries
Node syntax checks and unit tests validate code structure and plugin behavior only. Live Baileys broadcast requires a logged-in bot with group membership; auction requires the website deployment and Stage 18 SQL applied. The energy ledger remains local JSON and is not the RPG player snapshot.

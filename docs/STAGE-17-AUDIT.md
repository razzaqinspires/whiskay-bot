# Stage 17 — Bot WhatsApp audit

## Implemented
- Added `group-moderation` plugin: `.kick @user`, `.add 628...`, `.promote @user`, `.demote @user`, `.linkgroup`. The caller must be a group admin; the bot must be admin for membership/role actions.
- Added `.explore` event reports and `.enterdungeon` checkpoint access link. Links are HMAC-signed, tied to the player's hashed ID, and expire after 15 minutes. `.enterdungeon` uses the configured energy middleware cost.
- Added `.meme TOP | BOTTOM` for replied images via FFmpeg; FFmpeg must be installed on the host.
- The dungeon RPG command now attempts to fetch the web snapshot on each player load when `DUNGEON_WEBSITE_URL` is configured. It rejects server errors instead of silently treating a remote outage as a new level-1 player. Writes check the dashboard sync result before local persistence.

## Configuration
Set `DUNGEON_WEBSITE_URL`, `DUNGEON_SYNC_TOKEN` and the matching website `BOT_SYNC_TOKEN` (or `DUNGEON_SYNC_TOKEN`). Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only on the website server. Never expose service-role credentials to browser code.

## Important limitations
- Existing RPG combat still contains a JSON-file migration/fallback path for environments without `DUNGEON_WEBSITE_URL`; full authoritative economy requires moving each combat reward/spend to server-side Supabase RPCs. The existing snapshot endpoint intentionally preserves some server-authoritative fields, so do not treat this stage as proof of fully atomic two-way economy transactions.
- Group moderation is subject to WhatsApp's admin permissions and Baileys runtime support.
- Meme conversion requires a system FFmpeg binary; there is no bundled binary.

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

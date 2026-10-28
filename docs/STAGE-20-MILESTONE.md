# Stage 20 Milestone — Nexora, Companion, Canvas Games & Group Safety

Date: 2026-10-27

## Bot updates
- Added the missing `attachSerializerRuntime` export as an alias of the existing socket compatibility extender. This fixes the startup import error reported for `src/core/Bot.js`.
- Added a complete, safe `.env.example` including the `AI_SYSTEM_PROMPT` for Nexora. Real `.env` files and session data are intentionally not packaged.
- Added `.hatch`, `.feed`, `.mypet`, and `.pet` commands backed by the RPG `/api/player/pet` endpoint and Supabase snapshot. Hatch cooldown is 12 hours; feeding consumes a known pet-food item from the web RPG inventory.
- Added `.slot` / `.casino` image mini-game. It is entertainment-only, has no stake, and does not debit top-up balance. It needs `canvas` or FFmpeg to render PNG.
- Added opt-in Canvas V2 welcome/leave image cards on `group-participants.update` when `.welcome on` is enabled. Profile-photo fetch is best-effort; WhatsApp may not expose every participant image.
- `.antilink on` detects WhatsApp group invite links (ordinary website URLs are unaffected). Default action is warning/deletion; auto-kick is opt-in (`ANTILINK_AUTO_KICK=false` by default), requires the bot to be admin, and only occurs after the configured warning threshold.
- Energy regen worker uses one unref'd interval, serialized writes, a skip-if-busy guard (no accumulating timer backlog), and only persists when at least one record changes. Replenishment uses +0.01 percentage point per second. Pending file writes are counted explicitly for runtime diagnostics.
- Fixed PN/LID identity matching so a phone-number JID is not treated as the same account as a LID just because the digits happen to match.

## Web RPG updates
- Added `/api/player/pet` route for server-validated hatch/status/feed operations, inventory food consumption, persisted pet stats, and cooldown enforcement. It uses the same `BOT_SYNC_TOKEN` / `DUNGEON_SYNC_TOKEN` as the bot and Supabase service-role key only on the server.
- Added `VirtualPet.jsx`, a procedural 3D follower with species-specific simple meshes, floating motion, name/status tag, and passive +8% movement speed while active and energized.
- Spirit Seed and Night Wisp now appear only during in-game night (06:00–18:59 is day; 19:00–05:59 is night).
- Added `PetManagementOverlay.jsx` to display pet species, hunger, energy, and sync state. Feed in WhatsApp changes the persisted snapshot and is delivered through Supabase Realtime if that service is configured.

## Configuration
- Copy `.env.example` to `.env` in each project and add values locally. `DUNGEON_SYNC_TOKEN` on the bot and `BOT_SYNC_TOKEN` (or `DUNGEON_SYNC_TOKEN`) on the web must be the same random secret. Never expose `SUPABASE_SERVICE_ROLE_KEY` in `NEXT_PUBLIC_*` variables.
- For group member cards, the bot account must have access to the group and `canvas` or FFmpeg should be installed.
- For visible web live updates, configure Supabase Realtime/publication and the app's public Supabase URL/anon key as already documented in the project.

## Verification limits
The ZIP is source-only. PNG rendering for slot, welcome, and leave cards was exercised in the build environment. The bot test suite includes regression coverage for Stage 20 and PN/LID separation; live WhatsApp pairing, actual provider credentials, profile-photo availability, and deployment behavior remain environment-dependent. The pet endpoint currently uses Supabase REST read/merge/write; high-concurrency economy writes should be moved to a PostgreSQL RPC with row-level locking before production scale.

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

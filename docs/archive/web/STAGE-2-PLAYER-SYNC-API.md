# Stage 2 — Player Snapshot API (Corrected)

The companion website and WhatsApp bot are separate projects. This website owns the HTTP
API and database access; the bot owns the RPG game logic and pushes snapshots.

## Selected API contract

- `POST /api/sync`: bot-only snapshot write. Requires `Authorization: Bearer <BOT_SYNC_TOKEN>`
  (or `DUNGEON_SYNC_TOKEN` as fallback).
- `GET /api/player?player=<opaque-player-id>`: website dashboard read endpoint.
- `GET /api/floors`: website dungeon floor definitions.

The bot derives the opaque player ID from chat and sender using SHA-256 and truncates it to
32 hex characters. The bot must use the same helper for writes and dashboard links. The raw
WhatsApp sender ID is not sent to the website database.

## Environment variables

Website deployment (Vercel):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BOT_SYNC_TOKEN` (long random secret)

Bot deployment:
- `DUNGEON_WEBSITE_URL=https://whiskay-rpg-companion.vercel.app`
- `DUNGEON_SYNC_TOKEN` with the exact same secret as website `BOT_SYNC_TOKEN`

Never expose these values in client-side variables or commit `.env` files.

## Verification

Run `npm run verify:routes`, `npm run verify:joystick`, `npm run verify:stage1`, and
`npm run verify:stage4`. These are static checks; a successful run does not prove a live
Supabase or Vercel integration. The bot project has its own `.rpgsync` command to inspect
the snapshot endpoint.

The older `/api/player/sync` route was removed because it accepted a different identity format
(phone/JID) and was incompatible with the established opaque-ID `/api/sync` contract.

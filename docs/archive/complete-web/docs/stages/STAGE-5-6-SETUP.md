# WHISKAY RPG — Tahap 5 & 6

## Website environment
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server only; never expose as `NEXT_PUBLIC_*`)
- `BOT_SYNC_TOKEN` (must match the bot's `DUNGEON_SYNC_TOKEN`)

## Database migration
Run the complete `schema.sql` in the Supabase SQL Editor. It creates the `player_snapshots` table and two atomic PostgreSQL RPC functions:
- `claim_player_daily(p_player_id)` — grants 100 Gold once per rolling 24 hours.
- `buy_player_item(p_player_id, p_item_id)` — sells one Small Potion for 25 Gold.

The functions lock each player's row (`FOR UPDATE`) to prevent double claims and concurrent overspending. The API routes call the functions server-side with the Supabase service-role key.

## Bot environment
- `DUNGEON_WEBSITE_URL=https://your-deployed-website.example`
- `DUNGEON_SYNC_TOKEN=the-same-secret-as-BOT_SYNC_TOKEN`

Commands use the bot's configured prefix (examples: `!daily`, `!buy potion`). The API accepts the existing opaque 32-character player ID derived from the chat/sender identity, not a raw WhatsApp number. This preserves the same dashboard identity and avoids sending a phone number to the website API.

## Important state note
Daily/shop transactions modify the website's `player_snapshots` record. The bot's older local RPG JSON files are still a separate gameplay store; they are not automatically mutated by these remote commands. To make all local gameplay commands and remote purchases share one authoritative balance, the next integration step is to migrate gameplay reads/writes to the same backend or add a carefully designed reconciliation/ledger. Until then, do not assume a remote reward updates the local-only RPG balance.

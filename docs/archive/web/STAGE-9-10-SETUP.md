# WHISKAY RPG — Stage 9 & 10

## Stage 9 commands
- `.gacha`: 100 Gold, equipment drops Common 70%, Rare 25%, Epic 5%.
- `.craft potion`: 2 `material-herb` + 1 `ashen-core` -> 1 `potion-small`.
- `.trade @user gold 100` or `.trade @user potion-small 1` (group only).

### Database
Run the full updated `schema.sql` in Supabase SQL Editor. This adds atomic RPCs for gacha, crafting, and trade. Monster loot must grant exact material IDs `material-herb` and `ashen-core`; there is no safe way to craft materials that the server has not awarded.

## Stage 10 Realtime
Set server env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BOT_SYNC_TOKEN`, `SUPABASE_JWT_SECRET`. Set public env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `SUPABASE_JWT_SECRET` is the legacy HS256 JWT secret from Supabase, not the service-role key. If your project uses asymmetric signing keys only, this token-minting method needs to be adapted to your project's signing setup. Redeploy after setting variables.

Open `/inventory?player=<32-char-player-id>` to enable the scoped realtime bridge. The API issues a 5-minute JWT with a `player_id` claim; the RLS policy restricts subscriptions to that player row. The public anon key is designed to be public; never expose the service role key.

The current player ID scheme is `sha256(chat + '|' + sender).slice(0,32)`. Trade works for players in the same WhatsApp group identity scope; the recipient must have a snapshot under that group-scoped ID. A future identity migration would be needed to make one global player profile across all chats.

## Tests
Bot: `npm test`. Web: `npm run verify:stage9-10`, then `npm run build`. The static verifier is not a substitute for running the SQL in a staging Supabase project and testing two real WhatsApp accounts.

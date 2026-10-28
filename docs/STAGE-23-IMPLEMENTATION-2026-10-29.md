# Stage 23 — Core Bot ↔ Web Companion Foundation (2026-10-29)

## Scope
Stage 23 introduces the first integration layer for the five-literasi blueprint. It preserves `serializer-compat.cjs` unchanged and implements a flexible wrapper in `src/core/serializer.js`, user-level menu battery preferences, fast-charge selection, Mod Coin ledger primitives, battery capacity upgrades, command/battery pagination, and sync payload fields for the companion.

## Literasi 1 — Message wrapper
- `ctx.reply(text)` sends quoted plain text. Legacy multi-argument reply calls are forwarded to the compatibility implementation.
- `ctx.send({text})`, `ctx.send({media, mediaType, text})`, `ctx.send({buttons})`, and `ctx.send({list})` use the socket or existing interactive helper.
- `ctx.analyze(context)` returns a bounded context envelope. It does not independently infer sentiment or proactively message users yet.
- `serializer-compat.cjs` is intentionally untouched.

## Literasi 2 — Menu, battery and economy
- Two fonts added: `bolditalic` and `square`.
- `.setmenu battery match_menu|default` and `.setmenu notification hide|merge|separate` persist per-user preferences.
- Notification middleware supports hidden, merged, and separate-bubble energy receipts.
- `.charge` offers 5V standard and 15/20/25/30/33V fast-charge choices; fast charge requires Premium. Costs are currently `(volts - 5) * 10` Mod Coins.
- `.charge upgrade` increases capacity by 50 up to 10,000 for 100 Mod Coins.
- `.buy modcoin [quantity]` creates a price quote using the configured premium/token reference price × 1.002 and displays configured bank/e-wallet methods plus QRIS when the file is available. It does **not** auto-credit coins: payment proof must be reviewed by an owner.
- `.statusbaterai` renders a dynamic bar, capacity, voltage and Mod Coin balance.
- `.newcmd` renders commands with a seven-day countdown based on the command ledger.
- `.batterydashboard [page]` is owner-only and paginates 100 users. `.menu [page]` paginates command rows by 100 and switches to a light text response below 10% energy.

## Literasi 3 — Bot/Web sync
- `/api/sync` accepts bounded economy/charging values when called with the configured bot bearer token.
- `schema.sql` contains idempotent `players` column migrations. Verify the actual Supabase schema/table exists before applying in production; the current sync endpoint still persists the player snapshot JSON as its primary data path.
- Configure Supabase Realtime publication and RLS before enabling live traffic.

## Literasi 4 — Companion visual hooks
- `getFastChargeIndicator`, `getVirtualPetEnergyState`, and `getStage23WorldMood` expose UI state helpers.
- The patch adds state helpers, not a fully wired scene-lighting transition or complete shop UI. The companion must subscribe to `whiskay:player-update` and feed snapshot values to the scene before visuals change in-game.
- Shop CTA deep-link and end-to-end bot transaction integration remain follow-up work.

## Literasi 5 — autonomous awareness
- `ctx.analyze` supplies a bounded message/game context envelope.
- Passive sentiment responses, scheduled global-average energy detection, group raid announcements and red skybox event propagation are not activated by this patch. They need opt-in settings, rate limits, consent/safety checks, and a persistent event publisher before enabling.

## Verification
Run `npm test`, `npm run verify:ops`, and syntax checks from the bot folder. In the web folder run `npm run verify:all` and the production build after dependencies are installed. This archive does not claim live WhatsApp, payment, Supabase RLS/realtime, or production build verification.

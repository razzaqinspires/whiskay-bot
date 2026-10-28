# Stage 24 — Terminal Clarity & World Depth

Stage 24 is split into five literacies with five implementation categories each. Preserve all Stage 1–23 docs and archives; this file supplements rather than replaces them.

## Literacy 1 — Terminal log engine (5 categories)
1. **Engine:** `src/utils/logger.js` uses ANSI colors and no added dependency.
2. **Themes:** Minimalist, Cyberpunk, Matrix, Corporate, RGB Gaming.
3. **Owner control:** `.setlog 1..5` persists `data/log-preferences.json`; each log reloads the setting.
4. **Typed events:** `logger.command`, `logger.group`, `logger.private`, `logger.error`, `logger.success`, `logger.info`.
5. **Spatial formatting:** fixed-width labels, normalized one-line messages, Matrix event IDs, Corporate ASCII framing.

## Literacy 2 — RPG visual engine (5 categories)
1. **Post-processing:** documented integration seam; EffectComposer/SMAA/DOF/Bloom require adding compatible dependencies and profiling on target phones before activation.
2. **World generation:** deterministic seed generator in `lib/world/WorldGen.js`; same numeric seed produces the same marker list.
3. **Characters:** asset directory contract is created; licensed GLB/GLTF rigged assets are not bundled and must be supplied.
4. **Combat FX:** `components/fx/CombatFX.jsx` listens for `whiskay:combat-fx`, floats damage values and shakes on critical hits. Dispatch only after authoritative combat validation.
5. **Asset loading:** `RPGLoadingScreen.jsx` and `public/assets/unity_pack/README.md` provide the loading/asset contract. Actual WebP conversion and asset bundles are intentionally not fabricated.

## Literacy 3 — Bot ↔ Web state (5 categories)
1. **Coordinates:** SQL migration adds `player_world_state` with seed and XYZ.
2. **Web-to-bot actions:** architectural contract is documented; authenticated command gateway still requires deployment-specific socket infrastructure.
3. **Bilateral combat log:** browser event hook is available; a durable event relay must be connected before claiming cross-platform live sync.
4. **Buffering:** use a 30-second server-side coalescing buffer for position updates; never trust client damage/coin totals.
5. **Security:** service-role-only RLS and bounded coordinates are defined. Production JWT/session claims and rate limits must be validated in deployment.

## Literacy 4 — Mega Dungeon Master (5 categories)
1. **Weather/time context:** include server-verified world state in prompts only.
2. **Dynamic enemies:** elite spawn proposal must be deterministic, server-authoritative and bounded by player level.
3. **NPC personas:** route dialog through an allowlisted server AI adapter; never expose provider keys in browser.
4. **Spatial moderation:** rate-limit telemetry may trigger reversible game effects; do not use unverified terminal text as proof.
5. **Whispers:** scheduled DM hints need user opt-in, cooldowns and quiet hours.

## Literacy 5 — Economy & social (5 categories)
1. **Auction:** reserve inventory and funds atomically; web item props are a view, not the authority.
2. **Web gacha:** signed, expiring, single-use ticket and server-side random result are required.
3. **Guild plots:** map basecamp by stable guild ID and validate membership on server.
4. **Inflation:** daily job should calculate supply from ledger aggregates and apply bounded price multipliers.
5. **Leaderboard monument:** derive rank from server leaderboard; avoid trusting client-provided rank or avatar URLs.

## Test status
- `npm run verify:stage24` covers deterministic-generator structure, combat FX event hook, loading screen, asset contract, and SQL fields.
- This is a structural verification, not a production build or live Supabase/WhatsApp/WebSocket test.
- Unfinished infrastructure is explicitly marked rather than simulated as complete.

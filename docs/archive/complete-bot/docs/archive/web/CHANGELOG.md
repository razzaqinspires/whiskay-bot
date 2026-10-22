# Changelog — Whiskay RPG Next.js update

- Rebuilt the companion as a Next.js App Router project so `/dungeon` and `/inventory` are real routes, not rewrite targets to potentially missing HTML files.
- Added responsive landing and focused navigation tabs.
- Added procedural cel/toon-shaded hero and guardian in React Three Fiber, Three.js scene lighting, particles, shadows, and Rapier physics colliders.
- Added mobile landscape prompt, best-effort fullscreen/orientation lock, optional device-orientation steering, and touch joystick.
- Added distinct synthesized Web Audio cues for attack, skill, buff, guard, dodge, potion, hit, and victory.
- Preserved the canonical 10-floor JSON data from the bot project.
- Added `/api/floors`, read-only `/api/player`, and authenticated `/api/sync` routes for optional Supabase snapshot integration.
- Added seed/template/spirit-sheet specification and SVG sprite-sheet layout template.
- Added visual concept art; it is reference art and is not misrepresented as a rigged model or production sprite atlas.

## Adventure Mode prototype — 2026-10-21
- Added `/adventure` as a separate free-roam 3D world prototype.
- Added procedural forest, stylized player, guide NPCs, dummy enemies, checkpoint interaction, weather presets, season palette changes, keyboard and touch-button movement, and fullscreen toggle.
- Added Adventure/Dungeon navigation to the landing page.
- Scope note: this is a playable prototype, not a production open-world engine. Chunk streaming, persistent server checkpoints, real enemy combat AI/telegraphs, rigged character assets, and live bot synchronization remain follow-up work.

## 2.1.0 — Dungeon combat and mobile controls
- Added a dungeon HUD minimap with player, guardian, and exit/next-floor markers.
- Added a visible enemy wind-up telegraph and timed real-time enemy attacks; player attacks no longer trigger an immediate automatic counterattack.
- Dodge now has a 400 ms invulnerability window and a 1.2 s cooldown, with a cooldown indicator and Shift keyboard binding.
- Added responsive minimap/telegraph styling and fullscreen toggle behavior that avoids redundant fullscreen requests.
- Adventure mode now has a drag virtual analog, a position/checkpoint minimap, and local save/restore for position, checkpoint, weather, and season.
- Bot RPG expansion accepts `use potion 1`, supports `usepotion`, and provides `adventure exit`.

### Scope note
This release improves the existing playable prototypes. Full server-authoritative two-way real-time synchronization, persistent shared inventory/equipment across the legacy RPG store and expansion store, chunk-streamed open world, advanced enemy navigation, and production GLB/audio asset packs still require a backend and asset pipeline; they are not represented as completed here.

## 2.2.0 — Aetheria controls, physics, inventory, and Gacha
- Removed duplicate root-level `/api/*.js` functions; App Router handlers are the only owners of `/api/floors`, `/api/player`, and `/api/sync`, fixing the route-name collision reported by Vercel.
- Set the floors endpoint to `force-dynamic` with `revalidate = 0`; sync accepts the existing `DUNGEON_SYNC_TOKEN` name as a backward-compatible alternative to `BOT_SYNC_TOKEN`.
- Added NippleJS deadzone controls, draggable/persisted joystick and skill dock placement, portrait warning, asset progress overlay, Rapier kinematic movement proxy with slope/autostep configuration, quality presets, and optional synthesized ambience/SFX.
- Updated inventory to a 4×5 glassmorphism grid with item detail tooltips and Gacha currency/pity summary.
- Added bot Gacha banner, SSR/SR/R rarity pool, hard pity, single/ten pulls, duplicate shards, daily gem claim, collection/history commands, and Node built-in tests.
- Verification: web JS/JSX syntax and route-uniqueness checks pass; bot Gacha tests and JavaScript syntax checks pass. Production Next.js build could not be run in this environment because npm registry access failed with `EAI_AGAIN`; run `npm run build` in Vercel or a network-enabled environment to verify the complete dependency build.


## 3D mobile controls overhaul (2026-10-21)
- Added a smoothed third-person follow camera and right-side drag-to-look zone for 360-degree camera yaw.
- Analog movement is camera-relative with a 0.3 deadzone; no accelerometer/gyroscope APIs are used.
- Added dismissible, swipe-to-dismiss field notifications and adjusted overlay stacking for mobile touch controls.
- Fullscreen CSS hides non-game sections while the world canvas occupies the viewport.
- Kept 3D procedural world geometry, toon-shaded placeholder characters/monsters, and Rapier character controller.
- Device OS status/navigation bars cannot be hidden by a web page in every browser; fullscreen/orientation lock are best-effort browser APIs.


## Mobile runtime stability patch (2026-10-21)
- Added a 9-second fail-open timeout to the Drei progress overlay so WebViews that never emit loader progress cannot remain blocked at 0%. Asset errors are shown as fallback status.
- Raised the loading overlay above gameplay controls and orientation guard above loading.
- Applied safe-area-aware offsets to virtual joystick, skill dock, minimap, player HUD and notices.
- Increased joystick and skill dock sorting order so HUD panels cannot cover the touch targets.
- Moved Adventure notifications to the top-center and made the right camera-look zone non-scrolling.
- In mobile combat landscape, hides the large side panels, compacts player/enemy status, shrinks minimap, and anchors joystick/actions to bottom corners. Fullscreen combat hides page navigation and uses the whole viewport.
- Build verification remains pending because dependency installation timed out in this environment.

## 2026-10-21 — Mobile performance and animation pass
- Reduced procedural world foliage from 100 grass meshes / 58 trees to 30 grass meshes / 32 trees and memoized the static geometry elements.
- Disabled real-time shadow maps in mobile scenes, capped render pixel ratio, disabled MSAA on the mobile path, reduced star/particle counts, and removed the expensive dungeon contact-shadow pass.
- Removed the Adventure scene's per-position world-group translation, which duplicated motion and forced a large group transform every time player position changed.
- Added procedural walk-cycle animation for the Adventure hero's legs and arms, cape sway, directional facing, and idle-to-walk blending.
- Added leg gait animation for the wolf and distinct procedural Ember Slime and Crystal Stag enemy silhouettes/idle motion.
- Added a corresponding articulated walk cycle to the Dungeon hero and reduced arena particle/light cost.
- Validation: route verification and TypeScript JSX transpile parsing pass. A full Next.js production build could not be run because dependency installation timed out in this environment.

## 2026-10-21 — Rigged animation, LOD, preload and FPS overlay
- Added an optional GLB rig/animation controller using Three.js AnimationMixer through React Three Drei `useAnimations`, with cross-faded idle, walk, run, jump, attack, dodge and hit clip selection.
- Kept the existing procedural character as a graceful fallback when no GLB URL is configured or a model fails to load.
- Added optional hero/monster GLB preload configuration using `NEXT_PUBLIC_HERO_GLB_URL` and `NEXT_PUBLIC_MONSTER_GLB_URL`.
- Added a low-overhead real-time FPS overlay to Adventure and Dungeon scenes, sampled with requestAnimationFrame without React state updates each frame.
- Added distance-based LOD to procedural trees in Adventure.
- GLB assets are not bundled; configure optimized GLB files and make sure clip names include the documented animation labels.

## Open World Action Update
- Added distance-gated wolf aggro/chase and elite wolf movement tuning in Adventure.
- Added a closeable schematic world map and local quest-board accept panel.
- Kept existing GLB/preload/FPS, dungeon floor and dynamic API route structure.
- Verified API route uniqueness with `npm run verify:routes`; production build and Android runtime still require deployment testing.


## Open World Action Update v2
- Fixed camera-relative joystick forward/back mapping.
- Added touch actions: jump, sprint, attack, block, loot/interact.
- Added autonomous day/night and weather cycle, village houses, and collectible physical coins.
- Added joystick direction mock tests (`npm run verify:joystick`).


## Stage 1 — Story Lore & Dungeon Mechanics
- Added touch-friendly StoryLoreUI and Adventure NPC lore interaction.
- Added RangedMonster with floor-scaled cooldown damage to player HP.
- Added distinct lighting and fog profiles for Dungeon Floors 1 and 2.
- Added `npm run verify:stage1` static checks.


## Stage 2 — Player Sync API
- Added authenticated dynamic GET/POST `/api/player/sync` for WhatsApp player IDs and Gold/Level/Floor/Equipment.
- Added Supabase upsert/read adapter with process-local memory mock fallback.
- Added `npm run verify:player-sync` static checks.


## Bot-side RPG Sync (repository terpisah)
- Added ``src/plugins/games/rpg-sync.js` pada repositori bot Whiskay`, an ES Module dynamic command for fetching player status via the Stage 2 API.
- Added plugin environment/setup notes and static checks.


## Stage 4 — Boss AoE + Quick Use
- Added a touch-friendly Potion dock connected to existing potion healing logic.
- Added a lightweight Elite Boss for Floor 5 with a ground AoE telegraph, delayed impact, and dodge-radius check.
- Added static verification script `verify:stage4`.


## Integration cleanup — October 2026

- Removed the misplaced generic Baileys plugin from the website repository; the native bot-side
  command now belongs under `src/plugins/games/rpg-sync.js` in the separate bot repository.
- Kept one snapshot write contract (`POST /api/sync`) and one dashboard read contract
  (`GET /api/player?player=...`) using the same opaque player ID.
- Removed the incompatible `/api/player/sync` route and legacy root `/api` handlers to avoid
  duplicate endpoints and phone-ID/hash-ID mismatches.
- The older Stage 2 entry above describes a route that has since been removed; use the corrected
  contract in `STAGE-2-PLAYER-SYNC-API.md`.

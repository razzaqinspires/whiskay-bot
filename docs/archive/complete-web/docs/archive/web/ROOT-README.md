# Whiskay RPG — Next.js 3D Arena Scaffold

A browser-first anime-inspired RPG prototype with explicit `/dungeon` and `/inventory` routes, 10 floor records, responsive HUD, procedural cel/toon-shaded character/enemy, touch joystick, keyboard controls, sound cues, portrait rotation gate, optional device-orientation permission, and local browser save.

## Tech stack
- Next.js 14 / React 18
- Three.js + React Three Fiber + Drei
- `@react-three/rapier` for scene physics/colliders
- Zustand for player state
- Web Audio API for per-action SFX

## Run locally
```bash
npm install
npm run dev
```
Open `http://localhost:3000`, then `/dungeon?floor=1&player=<opaque-player-token>` or `/inventory?player=<opaque-player-token>`.

## Deploy to Vercel
Import this folder as the project root and use the default Next.js build settings. Do not deploy only the contents of `public` or the old static prototype. Every route is an App Router route, so `/dungeon` and `/inventory` are explicit pages rather than rewrites to missing files.

## Bot commands / integration
The website supports the same `/dungeon?floor=N&player=...` link pattern as the companion bot. The `player` query is presently a routing token only; client progress saves in localStorage and is not trusted server-side. For true bot-to-web sync, add an authenticated API using Supabase and a stable opaque player ID. Never expose `SUPABASE_SERVICE_ROLE_KEY` or `BOT_SYNC_TOKEN` to client-side code.

## Assets: seed, template, spirit sheet
- `lib/floors.json` is the existing 10-floor dungeon content source, retained from the current companion.
- `public/assets/whiskay-rpg-concept.png` is a visual concept reference, not a runtime sprite atlas.
- Characters are currently generated procedurally from toon-shaded Three.js meshes; no external rigged GLB character asset is bundled. For production anime animation, replace `HeroModel`/`EnemyModel` with rigged `.glb` files and clips from Blender/Mixamo, and add actual sprite/texture atlases in `public/assets`.

## Graphics / Vulkan note
Browsers expose WebGL2 and increasingly WebGPU; a website cannot reliably force the native Vulkan backend. Chromium may use Vulkan internally on supported Android/GPU configurations, but this is browser-controlled. The current renderer requests high-performance WebGL and uses adaptive DPR; it does not claim native Vulkan rendering. WebGPU renderer migration should be a separate tested capability-detection task.

## Current scope and limitations
- Single-player client-side combat prototype, not server-authoritative multiplayer.
- Touch joystick moves the character model; keyboard movement supports WASD/arrows; combat buttons trigger distinct synthesized sound cues and visual effects.
- Device orientation permission is optional and browser-dependent. Landscape orientation lock is attempted after user interaction and may be refused by the browser.
- The floor file preserves the companion's ten floor definitions; balance, hitbox timing and enemy AI require playtesting on actual devices.

## Adventure mode prototype
Run `npm install` and `npm run dev`, then open `/adventure`. This route provides a separate procedural 3D free-roam scene with WASD/arrow-key movement, touch buttons, NPC/enemy visual placeholders, weather/season presets, and a local checkpoint interaction. `/dungeon?floor=1` remains the ten-floor dungeon combat route. This build is a feature prototype; it does not yet include server-authoritative multiplayer, live WhatsApp bot synchronization, streamed world chunks, or full real-time enemy AI.

## Aetheria systems update

- `app/api/*/route.js` is the single owner for API endpoints. Do not recreate a root-level `/api/*.js` directory beside the App Router; Vercel can otherwise emit duplicate functions (`EEXIST`, e.g. `/api/floors`).
- API handlers explicitly opt into `dynamic = 'force-dynamic'`; `/api/floors` also sets `revalidate = 0`.
- Adventure now includes a Drei asset progress overlay, portrait-orientation guard, NippleJS analog with a 0.3 force deadzone, draggable/persisted joystick and skill dock positions, adjustable render pixel ratio, Rapier kinematic movement proxy with a 45° slope limit and ground offset, and synthesized optional ambience/SFX controlled by user gesture.
- Inventory now presents 20 glass-style slots with rarity accents, hover details, and synced gems/pity/shards summary. Gacha pulls are performed through the bot so the existing authenticated server-side sync remains the source of truth.
- Web route verification: `npm run verify:routes`.

## WhiskayBot Gacha

- `gacha rates` — banner rates and pity status.
- `gacha summon 1` / `gacha summon 10` — spend 30 / 270 Aether Gems.
- `gacha daily` — claim 40 gems once per 24 hours.
- `gacha history` / `gacha collection` — review pulls and collected spirits.
- Rates: SSR 3%, SR 17%, R 80%, hard pity at 50 pulls. Duplicate spirits convert to shards. Run `npm test` in the bot project to test the gacha engine.

## 3D mobile control overhaul
The Adventure scene remains a Three.js 3D world (not a 2D sprite-sheet game). It now uses a smoothed third-person follow camera, camera-relative virtual-joystick movement, and a right-side drag-to-look touch zone. No accelerometer or gyroscope event handlers are used. The notification card can be closed with × or dismissed with a vertical swipe. The existing sprite atlas is concept/reference art only; it is not used as the 3D player or enemy model. Terrain and characters remain procedural 3D toon-shaded placeholders until production GLB assets are supplied.

On mobile browsers, fullscreen and landscape locking are best-effort browser APIs. A website cannot universally hide Android system bars, and orientation lock generally requires a user gesture and fullscreen support.


### Mobile stability notes
The 3D Adventure loading overlay has a bounded 9-second fallback for WebViews where `useProgress()` remains at zero. The overlay does not imply every remote asset succeeded: missing assets should use procedural scene content, and errors are reported in the loading label. Mobile HUD positions respect CSS safe-area insets. In landscape combat mode, large side panels are hidden to preserve the viewport; player and enemy status remain compact. Browser fullscreen/orientation locking still depends on platform support.

### Mobile performance profile
The 3D scenes use capped device-pixel-ratio settings, disabled realtime shadow maps, and reduced foliage/particle counts to improve frame pacing on mid-range Android devices. The graphics selector provides Low, Medium, and High profiles; if frame pacing is still uneven, start with Low and disable the Rain weather effect. The hero uses procedural joint pivots for an idle/walk cycle; Adventure includes separate Wolf, Ember Slime, and Crystal Stag procedural models with different idle motion. These are lightweight placeholder models, not imported production-grade animated GLB rigs.

### Verification note
The updated route verifier and JSX transpile parsing passed. A full `next build` was not verified in this environment because `npm install` timed out while accessing the package registry. Test the production build and frame pacing on the target Android/WebView device before replacing the live deployment.

## Rigged GLB models, LOD, and FPS counter

The game can use rigged GLB assets without losing the existing procedural fallback. Configure these public environment variables in Vercel or `.env.local`:

- `NEXT_PUBLIC_HERO_GLB_URL=/assets/models/aetheria-hero.glb`
- `NEXT_PUBLIC_MONSTER_GLB_URL=/assets/models/aetheria-monster.glb`

Place the matching optimized files in `public/assets/models/` (or use a trusted HTTPS asset URL with appropriate CORS headers). Leave either variable unset to keep its procedural fallback. The GLB controller selects animation clips by case-insensitive names containing `idle`, `walk`, `run`, `jump`, `attack`/`slash`, `dodge`/`roll`, or `hit`/`hurt`. If a clip is absent, it falls back to idle/first available clip. Use a consistent humanoid rig and normalized model scale/orientation for best results. The preload hook warms configured GLBs; it does not bundle or manufacture model files.

A compact FPS meter is shown in the upper-left safe area on Adventure and Dungeon. It measures requestAnimationFrame cadence (a useful display estimate, not a GPU profiler). Adventure's tree models use distance-based LOD. Start with Graphics Quality Low on mobile; test FPS after the device has warmed up.


## Stage 8 — Open-world chunking and World Boss

- `components/WorldManager.jsx` streams procedural tree chunks around the player (3×3 neighborhood, 20-unit chunks) and lets Three.js frustum culling and Drei `Detailed` reduce off-screen/distant cost.
- `components/WorldBoss.jsx` is a lightweight procedural boss with a pulsing red AoE telegraph and a `whiskay:worldboss-aoe` event after its wind-up. Adventure mode has a local prototype HP bar and potion quick-use dock.
- Quick-use HP/potions are local prototype state, not yet authoritative server inventory. This does not guarantee 60 FPS on every phone; test the target device and use Low graphics if needed.

Verify with `npm run verify:stage8`.


## Stage 11 — Day/Night & Weather

`WorldManager.jsx` smoothly interpolates ambient, directional, and hemisphere lighting from the in-game hour and weather. Rain uses a bounded particle buffer. Run `npm run verify:stage11` then `npm run build`. Existing Web and Bot source trees remain separate.

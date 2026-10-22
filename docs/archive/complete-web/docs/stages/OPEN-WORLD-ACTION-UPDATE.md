# WHISKAY RPG — Open World Action Update

## Included in this iteration

- Adventure wolves now have a distance-based aggro/chase loop, directional facing, a movement gait, and an elite variant with a faster chase speed and larger scale.
- Adventure UI now has a closeable schematic world map and a local quest-board panel with a local accept state.
- Existing Dungeon real-time telegraph/dodge flow, floor scaling data, GLB hooks, preload component, quality selector, and FPS overlay are preserved.
- Route check: `npm run verify:routes` passed (3 unique dynamic App Router endpoints).

## Important scope notes

This remains a web-game prototype. The new quest acceptance is local UI state, not a server-backed quest ledger. Wolf aggro is a lightweight distance-based prototype, not navmesh pathfinding; it does not implement authoritative collision-based damage. The world map is schematic. Village structures are still procedural geometry, not imported production environment assets. The existing floor system uses its configured floor data and should be play-tested for combat balance.

## Mobile performance

Start with Graphics Quality = Low and watch the in-game FPS overlay during rain and combat. The wolf AI is deliberately distance-gated (active only between 2.1 and 13 world units) to avoid unnecessary work when far away. Keep a deployment preview until the full Next.js build and on-device tests pass.

## Verification

- `npm run verify:routes`: passed.
- ZIP integrity: checked after packaging.
- Production build / Android runtime / measured FPS: not run in this environment because `node_modules` are not installed.

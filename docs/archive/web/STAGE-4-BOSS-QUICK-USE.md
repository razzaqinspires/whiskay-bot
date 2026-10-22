# Stage 4 — Quick Use Potion + Floor 5 Elite Boss

## Modules
- `components/QuickUseUI.jsx`: translucent, touch-friendly Potion dock. Calls existing `act('potion')`; disabled when no potion or HP is full.
- `components/EliteBoss.jsx`: low-poly boss enabled on Floor 5. A ground ring marks the target area for 1.05 seconds before impact. The next AoE is scheduled after a 3.15-second cooldown.
- `components/GameClient.jsx`: mounts the dock and boss, applies AoE damage only if the player remains within the marked radius. Movement via the existing mobile movement control can evade the attack.
- `app/globals.css`: lightweight dock styling.

## Performance notes
No post-processing, physics colliders or per-frame React state updates are added for the boss. The warning ring uses one `ringGeometry` mesh and one transparent material. Existing `act('potion')` controls potion count and healing.

## Verification
Run `npm run verify:stage4`. This is a static check, not a full Next.js production build or Android runtime test.

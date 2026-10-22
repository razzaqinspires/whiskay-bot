# WHISKAY RPG — Stage 12–13

## Resource gathering
- Press/tap `ATK` (same action as `Q` in keyboard controls) near a generated tree or mineral node.
- Each node needs 3 hits. Tree grants 3 Wood; ore grants 2 Iron Ore.
- Materials are currently held in the Adventure page's local React state and shown in the HUD. This is a frontend prototype, not yet the authoritative Supabase inventory. Reloading the page resets gathered materials unless a later persistence/API stage is implemented.
- `MiniMap.jsx` projects player X/Z, nearby resource markers, and a World Boss marker.

## Verification
Run `npm run verify:stage12-13`, then `npm run build`. The verifier is static and does not replace a real browser/mobile test.

# Stage 1 — Story Lore UI & Dungeon Mechanics

## Added
- `components/StoryLoreUI.jsx`: responsive, translucent, touch-friendly lore modal. Shown on first Adventure entry; close/continue buttons.
- Adventure top button `Lore / Bicara NPC` opens Mira dialogue; text can also be changed to Elder Rowan lore through `openNpcLore('Elder')`.
- `components/RangedMonster.jsx`: lightweight ranged enemy using distance checks/cooldown, no per-frame raycast. It dispatches `whiskay:ranged-hit`; Dungeon parent applies damage to player HP and saves player state.
- Dungeon floor 1/2 use different fog, background, ambient intensity, and key light colors. Other floors use a darker purple palette.
- `npm run verify:stage1` performs static checks.

## Performance notes
Ranged enemy uses one distance check per frame and a cooldown, no physics body or raycast. For production combat, convert its event damage into a server-authoritative combat system and add a real projectile collision test.

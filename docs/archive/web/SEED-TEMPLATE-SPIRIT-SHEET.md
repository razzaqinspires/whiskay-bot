# Whiskay RPG — Seed, Template & Spirit Sheet

## Seed World (10 floors)
Use `lib/floors.json` as the canonical seed file. It retains the existing `floor`, `id`, `name`, `recommendedLevel`, `environment`, `story`, `enemy`, `rewards`, and `combat` fields. Do not rename fields without updating the bot's floor parser.

## Character template
```json
{
  "id": "whiskay-hero-01",
  "name": "Adventurer",
  "archetype": "Aether Blade",
  "rig": "humanoid",
  "animations": ["idle", "walk", "run", "attack", "skill", "guard", "dodge", "hit", "victory", "defeat"],
  "toon": { "outline": true, "shadowSteps": 3, "rimLight": "#72f0ff" },
  "textureSlots": ["baseColor", "normal", "roughness", "emissive"]
}
```

## Spirit seed template
```json
{
  "id": "spirit-azure-seed",
  "name": "Azure Spirit Seed",
  "element": "Aether",
  "rarity": "Rare",
  "passive": { "name": "Resonance", "effect": "attack_percent", "value": 0.12 },
  "activeSkill": { "name": "Spirit Burst", "cooldownMs": 2600, "effect": "arcane_slash" },
  "audioCues": { "activate": "spirit-awaken", "hit": "arcane-impact", "buff": "resonance-rise" }
}
```

## Spirit sheet / sprite atlas contract
Recommended production atlas: 4 rows × 4 columns, transparent PNG/WebP, consistent cell dimensions; rows are idle, run, attack, skill; columns are frames 1–4. Keep the character pivot at bottom-center and export a separate normal/emissive atlas if using PBR. Current runtime does not pretend the concept image is a sprite sheet: it uses procedural toon meshes until rigged GLB/atlas assets are added.

## Audio cue registry
- `attack`: short metallic swipe
- `heavy`: low impact + blade resonance
- `skill`: rising arcane sweep
- `buff`: harmonic ascending chime
- `guard`: muted shield thump
- `dodge`: quick airy sweep
- `potion`: glass chime + healing tone
- `hit`: low impact transient
- `win`: two-note victory cue

The present implementation synthesizes these cues through Web Audio so no third-party sound assets are required; replace with licensed spatial audio assets for final release.

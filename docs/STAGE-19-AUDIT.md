# Stage 19 — Menu, Canvas V2, and Charging Audit

## Findings

- The menu renderer already selected `⚡` versus `📌` from `plugin.energyMode`, but the marker was coupled to `showEnergyEmoji` and had no explicit per-command energy annotation unless the energy-detail option was enabled. The category heading was pushed directly after the prior command, so `lines.join('\n')` left no intentional blank category separator.
- Menu and profile cards were previously produced by building SVG and invoking FFmpeg; there was no Node Canvas renderer.
- `.charge` changed energy immediately (+40% or full for premium) rather than recording a charging session with a completion timestamp.

## Changes

- Added an explicit blank line before each category heading and kept `⚡`/`📌`, `🎟️`, and `💎` markers beside the command label when their display option is enabled.
- Added menu widgets `rpgstatus`, `leaderboard`, and `commandhits`.
- `.setmenu template <name>` now applies a coherent theme font and widget set. `.setmenu template random` randomizes template, font, enabled widgets, spacing, borders, and ordering.
- Added `src/services/canvas-v2.js`: landscape Menu Card V2 (1200×675), portrait Profile Card V2 (900×1200), circular avatar injection, futuristic palette, XP progress bar, and RPG/economy stats. It uses the Node `canvas` package when present; FFmpeg SVG fallback is retained for hosts without the native package.
- `.setpp` maps to the profile image save flow. Reply to an image with `.setpp`; the saved image is embedded in the profile-card avatar frame rather than sent as the card itself.
- `.charge` now starts a persistent timed session: 1 percentage point per 252 seconds, or 420 minutes from 0% to 100%. `getEnergy()` calculates progress from timestamps, so restart does not reset the charge session. Charging auto-completes at 100% and `.charge stop` manually disconnects.
- Added `.statusbaterai`, owner-only `.setenergy auto on|off`, and a persisted passive regen switch adding 0.01 percentage points per second to non-charging users, capped at 100%.
- Added `.raidboss` as a high-energy simulation command. The energy middleware rejects it while charging before consuming command energy, with the requested CPU warning.

## Validation performed

- `node --check` passed for the changed ES modules.
- `npm test`: 39 existing tests passed before the Stage 19-specific checks were added.
- Canvas renderer smoke test produced PNG buffers for both card dimensions using the FFmpeg fallback because this environment cannot reach npm registry to install the optional native `canvas` module.
- No live WhatsApp test was run. Timed charging uses local JSON persistence, not Supabase. The auto-regeneration interval is process-local and resumes from the persisted switch when the bot starts.

## Operational notes

For native Canvas rendering, install `canvas` in an environment with its required native build libraries. The FFmpeg fallback remains available when `canvas` is not installed. `data/energy-ledger.json` and `data/runtime-switches.json` must be persistent across deployments/restarts. Avoid running multiple bot replicas against the same local JSON ledger; use a database-backed ledger for multi-instance production.

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

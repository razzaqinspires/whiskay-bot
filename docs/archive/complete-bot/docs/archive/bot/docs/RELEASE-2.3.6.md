# WhiskayBot v2.3.6 — Documentation, RPG, Ping and Repository Audit

## Included

- Consolidated root `README.md` with architecture, command atlas, deployment notes, security boundaries, and direct links to the official Razzaq Ventures website and source repository.
- Preserved previous menu, profile/scrape, YouTube, and website integration notes under `docs/`.
- `src/plugins/general/ping.js` now builds a dark diagnostic HTML/AIRich card with interactive fallback, runtime uptime, RSS memory, Node version, and host platform metadata.
- `src/plugins/games/rpg.js` introduces a turn-based dungeon RPG with persistent per-chat/player state, XP/level/rank, HP, gold, weapon power, floors, victories, potions, and rest mechanics. Landscape PNG profile cards are rendered with FFmpeg and sent separately from interactive action buttons.
- `.github/workflows/repo-update-history.yml` records minimal commit metadata to `docs/history/updates.jsonl` after eligible pushes, avoiding a recursive history-only trigger.
- Runtime data is now excluded from Git by `.gitignore`.

## Website integration accuracy

The bot documentation now reflects the current website source files: the integration route calls `writeRecord` via `src/lib/rv-store.ts`, and the analytics route reads recorded sales/expenses. Production persistence still requires configured Vercel secrets, the `rv_records` table, and an end-to-end check. Visitor page-hit analytics remain unimplemented; source-update history is not visitor tracking.

## Verification

- JavaScript syntax checks passed for `ping.js`, `rpg.js`, `youtube.js`, and `scrape.js`.
- RPG plugin loaded in Node and a landscape PNG card was rendered locally using FFmpeg in a mocked command run.
- ZIP integrity is checked when the release archive is generated.
- Not yet verified: live WhatsApp rich-card rendering, live YouTube downloads, production website database writes, and GitHub Actions push permissions.

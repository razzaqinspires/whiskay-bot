# Stage 41 — Iteration 1: Game command transplant and menu visibility

Version: 2.27.0

## Changes

- Added `src/plugins/games/classic-quiz.js` with the ten quiz/game families present in the supplied `game.js` excerpt: `.tebakgambar`, `.susunkata`, `.family100`, `.tebakanime`, `.caklontong`, `.asahotak`, `.tebakjenaka`, `.tebakbendera`, `.tebaktebakan`, and `.tebaklirik`.
- Added `.jawab <answer>`, `.hint`, `.cleargame`, `.nyerah`, and `.cek` handlers. Answer input is intentionally command-based because the current command pipeline dispatches prefixed commands; arbitrary plain-text reply interception has not been added in this iteration.
- Game data tries the fixed Termai / Rifza public JSON endpoints with a short timeout and a 1 MiB response limit; curated local fallback questions keep the commands usable when the remote endpoint is unavailable.
- Game state is isolated by chat. A chat can have one active quiz session; normal rounds last one minute and Family 100 lasts five minutes. Sessions expire lazily when the next game command is handled.
- Added `menuCommands` and descriptions to `group-tools.js` so group commands are shown individually in the dynamic menu instead of only the plugin's first command. `.grouphelp` now opens a categorized interactive command picker rather than printing the long text block. Removed the duplicate `.grouphelp` registration from `group-safety.js` so group-tools is the single help handler.
- Updated `README.md`, `CHANGELOG.md`, package version, and verification script.

## Compatibility and limitations

- Prize values are shown as configuration hints but automatic energy payouts are not implemented here; do not interpret the display as an actual credit.
- The sample's multi-player Snake-and-Ladders board, minigames API / webview, full two-player SOS, and reply-to-answer event flow are not transplanted in this iteration. Existing `.catur` and `.tictactoe` remain separate plugins.
- External JSON endpoints were not live-tested. Remote content is parsed defensively and falls back to local questions.

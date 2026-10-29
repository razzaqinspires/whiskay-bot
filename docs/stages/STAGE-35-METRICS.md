# Stage 35 — Metrics and status

| Metric | Definition | Source | Status / caveat |
|---|---|---|---|
| Command XP | +3 to +5 XP after a plugin executes without throwing | `awardCommandXP()` / `data/leveling.json` | Implemented; command-key duplicate cooldown 15 seconds. |
| Level progress | XP remainder / `xpForNextLevel(level)` | leveling profile | Implemented; threshold remains exponential and should be tuned with live usage. |
| Chess rating | Initial rating 1000; +20 win, -15 loss, +5 draw | `chessStats` in app database | Heuristic rating, not Elo; win/loss updated when game ends. |
| Chess legal moves | `chess.moves({verbose:true})` | `chess.js` | Source integration implemented; runtime package installation and WhatsApp UI require deployment validation. |
| Canvas board | PNG generated from SVG board using `@napi-rs/canvas` | optional dynamic import | Partial until optional package is installed and validated on target OS. |
| Typo similarity | Edit-distance based textual similarity percentage | `core/typo-suggestions.js` | Existing path wired; percentage is similarity, not intent probability. |
| Energy controls | Low/insufficient energy interactive quick actions | `middlewares/energy-worker.js` | Existing implementation retained; live device rendering not verified here. |

Local Stage 35 tests: 3 passed, 0 failed. Full bot `npm run verify:all` passed, including previous stage suites. All JavaScript files under `src`, `test`, and `scripts` passed `node --check`. This does not verify live WhatsApp button rendering, chess package installation, or Canvas native compatibility.

# Stage 35 — Experimental-Bell Feature Gap Ledger

Source reviewed: https://github.com/Rifza123/Experimental-Bell (public README / documented behavior).

| Feature / concept | Stage 35 disposition | Evidence / next action |
|---|---|---|
| Declarative command/event registration | Adapted conceptually | Whiskay keeps its own ESM plugin + CommandHandler contract; don't introduce a parallel legacy event runtime. |
| Dynamic event emit / command re-routing | Partial / review | Use explicit plugin calls or shared command service; avoid hidden mutation of parsed user input. |
| Preconditions for args, media, URLs, mentions, quoted content | Partial | Use Whiskay context and middleware; add per-plugin declarative contracts where gaps are demonstrated. |
| Localized responses in `id.js` / `en.js` | Missing in some plugins | Stage 35 chess strings remain inline; localization migration is still required. |
| Native footer / compact mobile menu style | Existing patterns differ | Use existing serializer and message compatibility layer, test supported Baileys client payloads. |
| `autoBackup(detector.js)` | Not yet audited/ported | Inspect source and security implications before implementation; no claim of parity. |
| Chess.js game | Implemented in Whiskay | `.catur`, legal move list, recommended move, FEN/PGN, results and leaderboard. |
| All repository commands/plugins | Not exhaustively audited | README alone is not a complete command inventory; perform recursive source inventory in a later parity pass. |

## License / reuse
The source README states MIT. Direct code reuse must retain applicable copyright/license notices. Stage 35 primarily adapts documented behavior and architecture and does not claim a wholesale copy.

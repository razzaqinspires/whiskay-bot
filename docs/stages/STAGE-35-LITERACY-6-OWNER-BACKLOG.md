# Stage 35 — Literasi 6: Owner backlog (verbatim intent preserved)

1. `.catur` accepts a group mention or WhatsApp JID/number.
2. Use a proper chess module and Canvas board rendering.
3. Show two primary move controls: a quick-reply recommended move and a list of all legal moves available.
4. Add chess leaderboard.
5. Fix XP awards for successful command use; ensure leveling and level progression are active and worthwhile.
6. Energy notifications must use expected interactive buttons and honor Energy Saver behavior.
7. Typo suggestion logic must be wired into unknown-command handling and display similarity percentage.
8. Audit Experimental-Bell at https://github.com/Rifza123/Experimental-Bell and adapt all features that Whiskay lacks to Whiskay's own script structure.

## Scope/acceptance notes
- Command XP currently awards 3–5 XP per successfully executed command with a 15-second per-command cooldown to reduce farming. Level thresholds remain exponential; progression tuning should be revisited after observing real usage.
- Chess engine uses `chess.js`; Canvas PNG rendering is enabled when optional `@napi-rs/canvas` is installed. Otherwise game actions continue without an image board.
- Energy buttons and typo suggestions existed in the Stage 34 codebase; Stage 35 verifies and documents their wiring rather than duplicating these systems.
- Experimental-Bell's README documents an event framework and selected features. Exhaustive command-by-command parity is not claimed without a full repository audit. Continue the gap ledger in future stages.

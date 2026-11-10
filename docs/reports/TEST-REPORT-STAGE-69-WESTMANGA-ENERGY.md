# QA Report — Stage 69

## Baseline
- Source: WHISKAY-BOT v2.35.34 Part 11
- Target: v2.35.35 Part 12
- Node runtime used for focused test: current workspace Node runtime

## Focused tests
`node --test test/stage69-westmanga-energy-menu.test.js`
- 9 tests passed
- 0 failed
- Covers persistent ledger debit, Westmanga workload charging, exempt menu display, energy notification re-enable behavior, combined energy+XP delivery, download URL restrictions, protected source and command registration.

## Existing regression subset

A combined targeted run of Stage 69, energy-worker, Stage 45 energy notification, setmenu structure/order, and Stage 68 protected-library tests passed: **29/29 tests**.

## Static checks
- `node --check` passed for changed JavaScript files.
- Original Westmanga CJS source SHA-256 matches `SOURCE.sha256`.

## Not run / not claimed
- Full `npm test` and `npm run verify:all`.
- Live Westmanga API search or chapter download.
- Production WhatsApp command execution.
- Real DNS/redirect chain integration tests against the remote CDN.

## Production staging checklist
1. Install with `npm ci`.
2. Run `npm run verify:stage69`.
3. Run `npm run verify:stage68`, `npm run verify:stage67`, and full regression gates.
4. Run `.wmhome`, `.wmsearch <keyword>`, `.wmdetail <slug>`, `.wmread <chapter>`.
5. Test `.wmdownload` with one public chapter and confirm files only appear under `data/downloads/westmanga`.
6. Check `.energy audit` before and after a paid command. Compare energy and total spent.
7. Set `.setmenu energy-xp on`, then test a paid command. Confirm energy debit and XP are both displayed.

# Stage 41 — Iteration 2: Game Parity & Source Audit

## Scope delivered
- SOS multiplayer: challenge/accept/decline, board, turn enforcement, SOS line scoring, resign, expiry.
- Ular Tangga multiplayer: lobby, 2–4 players, dice, snakes/ladders, turn order, board and expiry.
- Minigames directory: list/search/category/detail and safe command launch shortcuts.
- Source family parity audit document and regression tests.

## Safety and design choices
- Uses Whiskay app database; no second balance/inventory database is introduced.
- External minigame URLs are not invented.
- Prize messaging does not credit energy until a verified Whiskay ledger integration exists.
- Live WhatsApp/API behavior remains unverified by local tests.

## Verification
Run `npm run verify:parity-transplant` and `npm run verify:all`. Record external service checks separately from local tests.

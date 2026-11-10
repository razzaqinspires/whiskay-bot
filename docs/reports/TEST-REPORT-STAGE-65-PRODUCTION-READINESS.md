# QA Report — Stage 65

## Environment
- Node.js: v22.16.0
- Baseline: Part 7 Stage 64 Part 2, v2.35.30
- Target release: v2.35.31

## Executed
- `npm run verify:stage64-part2`: 8/8 PASS
- `npm run verify:stage64`: 16/16 PASS
- `npm run verify:stage63`: 8/8 PASS
- `npm run verify:outbound-stability`: 46/46 PASS

## Blocked / failed gates
- `npm test`: blocked by the existing dependency preflight. Missing direct runtime packages reported: `@hapi/boom`, `@whiskeysockets/baileys`, `chess.js`, `chokidar`, `dotenv`, `pino`, `pino-pretty`, `qrcode-terminal`.
- `npm run verify:stage62`: failed to resolve `pino` from the partial `node_modules`.
- `npm run verify:all`: stopped at Stage 44 due to missing `dotenv/config`.
- `npm ci --ignore-scripts --no-audit --no-fund --prefer-offline`: did not complete within the execution window; dependency recovery is not marked successful.

## Interpretation
Stage 63/64 and Stage 64 Part 2 regression gates are green in this workspace. Full regression remains BLOCKED by an incomplete `node_modules`, not a confirmed application regression. Do not activate the primary WhatsApp account from this QA state.

## Production activation gate
Require a clean `npm ci`, `npm run doctor:production`, `npm run verify:all`, `npm test`, `npm audit --omit=dev`, backup/restore rehearsal on copied data, and a staging WhatsApp session before primary-account activation.

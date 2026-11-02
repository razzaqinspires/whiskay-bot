# Stage 42 Iteration 1 — Cloudflared runtime and Baileys Signal diagnostics

## Implemented
- Replaced unconditional `CLOUDFLARED_BIN` use with validated executable resolution.
- Candidate order: configured path, architecture-specific `JADIBOT_BIN_DIR` binary, `./bin` binary, then `cloudflared` from PATH.
- Invalid configured paths are warned about and skipped; when no candidate exists, the error includes the required architecture and install locations.
- Added regression tests for fallback and the no-binary error path.
- Added operational documentation for LID identity notifications, app-state sync missing-key errors, and group sender-key decryption retry receipts.

## Validation
- `node --check src/services/worldBossTunnel.js`: passed.
- `node --test test/stage42-cloudflared-resolution.test.js`: 2 passed, 0 failed.
- Syntax check across source/test/script JS files: passed.
- `npm run verify:all`: not fully passed in this environment. The six failures observed were subprocess tests unable to import `dotenv` because project dependencies are not installed in this extracted workspace. This is an environment/dependency limitation, not evidence that all regression tests pass.
- Actual cloudflared tunnel startup and WhatsApp Signal/app-state resync were not exercised; they require the deployment host and linked WhatsApp session.

## Important protocol note
Identity-key changes and an isolated `No session found to decrypt message` event are not safely repairable by deleting local auth state. Preserve the full session directory. Repeated app-state snapshot failures should be investigated with a full backup, one active process per session directory, stable persistent storage, and a Baileys version compatibility test on a copied session before production changes.

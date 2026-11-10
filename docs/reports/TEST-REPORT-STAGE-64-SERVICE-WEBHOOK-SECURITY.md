# Test Report — Stage 64 Service & Webhook Security

**Version:** `2.35.29`  
**Date:** 2026-11-09  
**Scope:** Webhook hardening, TEAMDROP streaming, Jadibot store, plugin disposal, AutoCleaner, persistent lock.

## Focused results

Command:

```bash
node --test test/stage64-*.test.js
```

Result: **16/16 passed, 0 failed**.

Coverage:

| Area | Assertions |
|---|---|
| TEAMDROP/Webhook | bounded rate limiter, content-length validation, streaming to `0600` temp file, oversized cleanup, length mismatch, empty payload, filename traversal/control-character sanitization, Cloudflare header trust gate, file signature validation |
| Jadibot store | concurrent mutations across two store instances and independent Node processes, valid backup creation, corrupt JSON fails closed, settings persistence |
| Persistent lock | serialized writers, token-checked release, malformed stale metadata is not reclaimed |
| Plugin disposal | structural checks for lease acquisition/release, retirement and disposal hooks, pending disposal visibility |
| AutoCleaner | structural checks for runtime data exclusions, one-hour minimum age, `lstat`, symlink/non-regular handling |

## Additional checks

- JavaScript syntax checks: run separately over all changed `.js` files.
- Package version and lockfile version: expected `2.35.29`.
- ZIP integrity: run `unzip -t` against the release archive.

## Limitations

- `node_modules` is not present in the build workspace. The focused Stage 64 tests use Node.js built-ins and ran directly without installing dependencies.
- `npm run verify:outbound-stability` passed 46/46 (Stage 58–61 and Stage 63 regression).
- `npm run verify:stage62` was attempted but is blocked at module loading because `pino` is absent from this dependency-free workspace.
- Full `npm test` and `npm run verify:all` are not claimed as passed in this report.
- Plugin disposal behavior is partly validated structurally because importing the full PluginManager requires runtime dependencies unavailable in this workspace.
- No live WhatsApp account, real TEAMDROP sender, Cloudflare edge, or multi-host filesystem test was performed.
- Persistent file locks are local-host advisory locks, not distributed locks.
- TEAMDROP file-signature checks are a format sanity check, not antivirus scanning, archive-bomb inspection, or full document parsing.

## Release gate

The focused Stage 64 suite passed. Deploy only after a backup of `data/` and `sessions/`, a clean `npm ci` on the target server, and the operator verification commands in the Stage 64 documentation.

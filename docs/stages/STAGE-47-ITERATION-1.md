# Stage 47 Iteration 1 — WhatsApp Connection Recovery

Version: 2.35.2

## Problems addressed

1. Startup preflight printed a non-zero `ls` result for optional bundled ARM64 Cloudflared files even though `/usr/local/bin/cloudflared` was installed and working.
2. Baileys reconnect state was local to each `connect()` call. Every new socket reset its retry counter, and old socket close events could schedule competing reconnects. After ten transient disconnects the process exited.

## Changes

- `scripts/daemon.mjs` reports bundled binaries as optional, detects the system PATH executable, and validates the selected executable with `--version`.
- `scripts/start.mjs` uses the same non-fatal bundled-binary diagnostics and displays the system Cloudflared version.
- `Bot.connect()` is single-flight through `_connectPromise`.
- Each socket has a monotonically increasing generation. Stale events from old sockets are ignored.
- Transient disconnects clear the active socket reference and schedule one retry with capped exponential backoff (maximum 60 seconds) plus jitter.
- Retries are not abandoned after ten attempts and do not force process exit for transient WebSocket failures.
- Logged-out and invalid-auth states are not retried endlessly. Existing opt-in session cleanup behavior is preserved.
- Graceful shutdown cancels pending reconnect timers and clears the socket reference.

## Operator checks

```bash
npm ci
npm run verify:stage47
npm stop
npm start
npm run status
npm run logs
```

`npm run status` reports whether the daemon process exists; it does not claim that WhatsApp is connected. Check the log for `Online`, `Connection closed`, and `WhatsApp reconnect scheduled`.

## Verification boundary

Automated tests validate the reconnect guards and startup preflight wiring. A live WhatsApp session, actual reconnect after network interruption, and Cloudflared behavior on the target ARM64 host require production verification. Do not delete the `sessions/` directory merely to silence transient WebSocket errors.

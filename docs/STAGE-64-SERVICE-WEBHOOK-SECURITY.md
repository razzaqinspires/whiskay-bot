# Stage 64 — Service & Webhook Security

**Release:** Part 7 · `2.35.29`  
**Baseline:** Part 6 · `2.35.28`  
**Runtime:** Node.js 20+, ESM, Baileys transport

## Objective

Harden external integrations and shared runtime resources so webhook traffic, TEAMDROP uploads, Jadibot persistence, plugin reload/disposal, cleanup, and cross-process file locks cannot destabilize the primary bot process.

## Changes

### 1. Webhook request handling

- `src/services/WebhookSecurity.js` provides bounded fixed-window rate limiting, strict `Content-Length` parsing, bounded JSON body reading, streamed upload-to-file handling, private temporary file permissions (`0600`), trusted-client-address handling, and filename normalization.
- TEAMDROP uploads remain streamed to disk; request bytes are not accumulated into a full in-memory Buffer.
- Added `validateDocumentFile()` to inspect only a 4 KiB prefix. PDF, legacy OLE Office, ZIP-based Office/OpenDocument, and UTF-8 text files are checked against their expected signatures/content class before WhatsApp forwarding.
- TEAMDROP upload concurrency and size are bounded by `TEAMDROP_MAX_CONCURRENT_UPLOADS` and `TEAMDROP_MAX_FILE_MB`.
- Webhook secrets remain server-side environment variables. Cloudflare client IP headers are trusted only when `WHISKAY_WEBHOOK_TRUST_CF_CONNECTING_IP=true` and the deployment is actually behind the trusted proxy.
- World Boss webhook keeps bounded JSON parsing, explicit target allowlisting, event-ID validation, persistent idempotency claims, and outbound source attribution.

### 2. Persistent webhook idempotency

- `src/services/webhookRuntime.js` persists SHA-256 event-ID keys, bounded outcome summaries, and TTL expiry under a file lock.
- Event claims are written before the WhatsApp side effect. This deliberately chooses **at-most-once** delivery: a crash after claim may leave an event in `processing`, and a retry is suppressed. This avoids duplicate broadcasts but can require operator inspection/reconciliation for an interrupted event.
- Stored records exclude webhook request bodies, credentials, phone/JID values, filenames, and uploaded content.

### 3. Jadibot data store

- `src/services/JadibotStore.js` centralizes rentals/settings reads and writes.
- Mutations use per-instance serialization plus `withFileLock()` for cooperating processes sharing the same local data directory.
- Writes use atomic replacement; rental updates preserve a valid prior backup.
- Corrupt JSON fails closed with `WHISKAY_DATA_CORRUPT`; it is not silently replaced with an empty rental database.
- Jadibot sessions remain under the private runtime data directory and are not part of source releases.

### 4. Plugin disposal

- `src/core/PluginManager.js` retires replaced plugin objects after the registry swap.
- `src/core/CommandHandler.js` holds a lease while a command is executing and releases it in `finally`.
- `dispose()` / `onDispose()` runs only after the final active command lease is released.
- Disposal is bounded by timeout. Timed-out underlying promises remain visible in diagnostics until they actually settle; `disposeAll()` waits within its shutdown budget and reports pending disposals.
- Plugin authors should clear timers, unregister event listeners, close streams/sockets, and stop owned workers in `dispose({reason, plugin, sourceFile, at})`.

### 5. AutoCleaner

- `src/core/AutoCleaner.js` explicitly excludes `data/`, `sessions/`, `.runtime/`, caches, environment files, lock files, and archives.
- Only matching regular files are eligible; symlinks and non-regular files are skipped.
- A hard minimum age of one hour applies even if a lower value is configured, reducing the chance of deleting active temporary artifacts.
- `waitForIdle()` remains available for graceful shutdown.

### 6. Persistent lock

- `src/utils/PersistentJsonStore.js` uses exclusive lock creation, owner token, PID/hostname metadata, bounded retry, and token-checked release.
- Stale locks are reclaimed only when owner metadata is valid, the hostname matches the local host, and the recorded PID is no longer alive.
- Malformed or partial lock metadata fails closed and times out instead of being deleted speculatively.
- This is a **same-host advisory lock** for cooperating local processes. It is not a distributed lock for NFS/network filesystems or multiple hosts.

## Configuration

Existing TEAMDROP variables remain supported:

- `TEAMDROP_WEBHOOK_SECRET`
- `TEAMDROP_WHATSAPP_TO`
- `TEAMDROP_MAX_FILE_MB` (bounded to 1–100 MB)
- `TEAMDROP_WEBHOOK_RATE_LIMIT` (bounded to 1–1000 requests/minute)
- `TEAMDROP_MAX_CONCURRENT_UPLOADS` (bounded to 1–4)
- `WHISKAY_WEBHOOK_TRUST_CF_CONNECTING_IP` (default false)
- `WHISKAY_WEBHOOK_REQUEST_TIMEOUT_MS` (server-side request timeout, bounded in `src/index.js`)

No new secret is generated or embedded in the repository. Keep actual values in `.env` or deployment secret storage only.

## Operational behavior and migration

- No destructive migration is required. Existing `data/jadibot/rentals.json` and `settings.json` remain the store paths selected by `JADIBOT_DATA_DIR`.
- Back up `data/` and `sessions/` before deployment. Do not copy runtime data into the source ZIP or Git.
- If a Jadibot JSON file is corrupt, stop writes and restore from a known-good backup after inspecting it; do not delete the corrupt file as a first response.
- If a lock times out, inspect the lock file's PID/hostname and process state. Malformed locks are intentionally not auto-deleted; after confirming no writer is active, move the lock aside manually.
- TEAMDROP now rejects content whose file signature does not match the declared extension. Senders must transmit actual document bytes, not placeholder text or renamed arbitrary files.
- `TEAMDROP_WEBHOOK_SECRET` should be a high-entropy secret and the endpoint should be exposed only over HTTPS (for example, through a correctly configured tunnel/reverse proxy).

## Rollback

1. Stop the bot gracefully.
2. Preserve `data/`, `sessions/`, and the current logs.
3. Restore the previous `v2.35.28` source package without overwriting runtime data.
4. Keep the same webhook secrets and `JADIBOT_DATA_DIR` values.
5. If TEAMDROP sender content fails signature validation, verify the sender's MIME/extension and actual bytes before rolling back the validation code.

## Test coverage

Focused tests are in:

- `test/stage64-webhook-security.test.js`
- `test/stage64-jadibot-store.test.js`
- `test/stage64-locks-disposal-cleaner.test.js`

Run `npm run verify:stage64`. The tests cover bounded rate limits, malformed lengths, streaming and cleanup, payload limits, filename sanitization, proxy-header trust, file signatures, concurrent Jadibot mutations, corrupt-store fail-closed behavior, settings persistence, lock serialization/token release, malformed-lock fail-closed behavior, and structural checks for plugin leases/disposal and cleaner protections.

A passing focused suite does not prove live Baileys delivery, real Cloudflare proxy configuration, or multi-host locking behavior.

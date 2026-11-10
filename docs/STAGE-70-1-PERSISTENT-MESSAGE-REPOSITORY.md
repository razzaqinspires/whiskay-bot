# Stage 70.1 — Persistent Message Repository Foundation

## Release
- Baseline: WHISKAY-BOT v2.35.37 (Part 12.2)
- Release: WHISKAY-BOT v2.35.38 (Part 12.3)
- Scope: persistence foundation only. Strict protocol identity and PN/LID resolver enhancements continue in Stage 70.2 and 70.3.
- Baileys version is unchanged and remains pinned by the existing lockfile.

## Why this part exists
The previous serializer kept WAMessage objects in a process-local Map (maximum 5,000). The map was lost on restart, and the old lookup could fall back to message ID alone. Baileys documents that applications should provide their own `getMessage` store for retry and poll decryption. The current upstream source also retrieves original messages for encrypted event response decryption and reads `messageContextInfo.messageSecret`.

## Files changed

### Added
- `src/services/message-repository/MessageRepository.js`
  - Persistent bounded message repository.
  - Atomic JSON replacement using `src/utils/PersistentJsonStore.js`.
  - Host-local cross-process lock.
  - TTL, maximum entry count, and maximum encoded byte budget.
  - Debounced writes (250 ms) to avoid one full disk write per incoming message.
  - Binary-safe serialization for Buffer, Uint8Array, ArrayBuffer and supported typed arrays.
  - Strict lookup key in this part: `remoteJid + id + fromMe + participant`.
  - Fail-closed schema validation; corrupt data is not replaced with an empty store.
  - Stats for stored/restored/misses/rejected/pruned.
- `test/stage70-1-message-repository.test.js`
  - Restart persistence.
  - Exact-key lookup.
  - Binary/messageSecret round-trip.
  - Invalid input rejection.
  - TTL pruning.

### Modified
- `src/core/Bot.js`
  - Initializes repository before socket creation.
  - Injects repository into the CommonJS serializer compatibility layer.
  - `getMessage` now performs an async exact-key lookup.
  - Returns `undefined` on cache miss; no fabricated empty conversation and no ID-only fallback.
  - Flushes pending repository writes during orderly shutdown.
- `src/core/serializer-compat.cjs`
  - Adds a repository adapter setter.
  - Keeps a bounded in-memory hot cache for synchronous serializer/quote operations.
  - Persists messages through the repository adapter.
  - Removes the ID-only fallback from the local synchronous lookup.
- `package.json`, `package-lock.json`
  - Version `2.35.38`.
  - Adds `verify:stage70-1` and includes it in `verify:all`.
- `.env.example`
  - Documents repository capacity and retention controls.
- `README.md`, `CHANGELOG.md`
  - Release index and change record.

## Data layout

Runtime data is deliberately excluded from the source ZIP:

```text
data/
└── message-repository/
    ├── messages.json
    ├── messages.json.bak
    └── messages.json.lock
```

The database is created on first successful initialization. It is not shipped with the source package.

## Configuration

- `WHISKAY_MESSAGE_REPOSITORY_MAX_ENTRIES=5000`
- `WHISKAY_MESSAGE_REPOSITORY_MAX_BYTES=50331648` (48 MiB)
- `WHISKAY_MESSAGE_REPOSITORY_TTL_MS=1209600000` (14 days)

Hard bounds in code prevent unbounded values. The repository is a local-host store: multiple processes on one host sharing the same data directory are serialized by the lock. Multi-host/NFS distributed deployment is not supported by this JSON adapter.

## Security and privacy

- The repository stores original message payloads, including cryptographic context required by Baileys. This is sensitive user data.
- Restrict `data/message-repository` to the bot OS account (directory mode 0700; file mode 0600).
- Do not print message content or `messageSecret` to logs.
- TTL and byte limits bound retention but do not make message data non-sensitive.
- Do not copy this runtime database into public source ZIPs or issue attachments.
- No automatic re-send behavior is added in this part.

## Current boundaries / known limitations

- Stage 70.1 establishes durable storage and exact lookup using the fields present in the Baileys key. It does not yet implement the full trusted PN/LID alias resolver.
- If a Baileys lookup omits `fromMe` or participant when the stored message includes those fields, the exact lookup intentionally returns a miss. Stage 70.2 will define safe optional-field semantics without weakening identity guarantees.
- The repository uses a JSON snapshot. It is appropriate for the current bounded scale but writes snapshots and is not a substitute for PostgreSQL/SQLite at much larger volumes.
- `remember()` queues a debounced write. A hard process kill inside the 250 ms debounce interval can lose the newest in-memory records; orderly shutdown flushes them. A future WAL/SQLite adapter can reduce this window.
- This part does not patch Baileys internals or upgrade the package.

## Verification

- `npm run verify:stage70-1`: 6/6 passed.
- Syntax checks: `MessageRepository.js`, `serializer-compat.cjs`, `Bot.js`, and test file passed.
- Full project syntax sweep and complete `npm test` / `verify:all` are not claimed here.
- No live WhatsApp session, retry, or poll-decryption staging test was performed in this workspace.

## Rollback

1. Stop the bot cleanly so pending repository writes flush.
2. Back up `data/message-repository/` before changing source.
3. Restore the previous v2.35.37 source.
4. Keep the message repository data untouched; v2.35.37 simply will not consume it.
5. Do not delete or merge the message database during rollback.

# Stage 60 — Data Integrity & Core Stability Recovery

**Release:** v2.35.25 · **Part:** 3 · **Date:** 2026-11-08  
**Status:** implemented; Stage 60 and focused cross-stage tests pass; full QA blocked by dependency installation timeout; live WhatsApp validation pending.

## 1. Scope

This stage repairs storage and registry behavior that could lose state or permit duplicate external side effects across restarts/processes. It does not claim to identify the historical WhatsApp enforcement reason or guarantee an account cannot be restricted.

## 2. Persistent JSON primitives

New module: `src/utils/PersistentJsonStore.js`.

- `readJsonFile(file, fallback)` returns a cloned fallback only for `ENOENT`; malformed JSON and other filesystem failures are propagated. Parse corruption is labeled `WHISKAY_DATA_CORRUPT`.
- `writeJsonAtomic(file, value, { backup })` writes a unique `0600` temporary file, syncs it, renames atomically, then attempts to sync the parent directory.
- Optional backups are created only from an existing valid JSON primary. A corrupted primary cannot be silently copied over the last good backup by a normal write.
- `withFileLock(lockFile, fn)` uses exclusive file creation, PID/hostname/token metadata, bounded retry and timeout, and stale-owner detection. It coordinates same-host processes that share a local filesystem. It is not a distributed lock for NFS/SMB or multiple hosts.

The normal Energy module still serializes writes within one process and additionally acquires `${ENERGY_FILE}.lock` around every mutating transaction. Atomic rename keeps readers from observing a partially written JSON file.

## 3. Energy ledger

Modified: `src/lib/energy-worker.js`, `src/middlewares/energy-worker.js`.

- Energy root and per-user records are validated. Invalid data fails closed; no mutation is made from a fallback empty object after corruption. Recovery status distinguishes a never-created file (`missing`) from malformed data (`WHISKAY_DATA_CORRUPT`).
- Every ordinary Energy ledger write backs up the previous valid state to `data/energy-ledger.json.bak`.
- `getEnergy()` uses an atomic snapshot read in the common case. When a charge has completed and state must be persisted, it re-reads under the cross-process lock before writing.
- `consumeEnergy()` is all-or-nothing. It no longer partially charges the remaining balance while allowing the command to continue. A stale middleware precheck causes `insufficient-energy`, and `energy-worker.js` aborts the command before calling the next plugin.
- Passive regeneration tracks `lastPassiveRegenAt`, credits elapsed whole seconds at 0.01 percentage points per second, and scans at five-second cadence. The persisted timestamp plus lock prevents the same interval from being credited by two local instances. Enabling regeneration resets timestamps to avoid retroactive credit while the switch was off.
- Energy debit while a charge session is active first resolves the current charge level, then rebases the remaining charge schedule from the post-debit balance. A later `getEnergy()` snapshot therefore cannot restore energy already consumed by a command.
- Manual energy adjustment/reset, charging start/stop/completion, and successful debit reset the passive-regeneration baseline. Full batteries do not trigger periodic ledger rewrites; a later debit establishes a fresh baseline before regeneration resumes.

### Recovery CLI

- Inspect: `npm run energy:ledger:status`
- Restore: `npm run energy:ledger:restore -- --confirm`

Restore is intentionally explicit. It preserves the current primary as `energy-ledger.json.pre-restore-<timestamp>-<id>` before replacing it with a schema-valid `.bak`. Do not run restore without first inspecting the result and taking a separate filesystem backup.

## 4. Plugin command registry

Modified: `src/core/Loader.js`, `src/core/PluginManager.js`; new `src/core/PluginRegistry.js`; modified owner plugin `src/plugins/owner/reload.js`.

- Recursive file discovery is sorted deterministically and each plugin receives a non-enumerable source path used for stable ordering.
- Commands are registered before aliases. The first lexical source path claims a command token. Later duplicate command tokens, aliases shadowed by commands, and duplicate aliases are skipped rather than overwriting existing mappings.
- Conflict diagnostics include type, token, winner source, and skipped source. `.reload` presents the count and up to five conflict rows to the owner.
- The plugin itself is not deleted and non-conflicting tokens from that plugin can still register. Existing duplicate candidates remain in source for future manual semantic review.

## 5. Webhook idempotency

Modified: `src/services/webhookRuntime.js`, `src/index.js`.

- TEAMDROP and World Boss event IDs are hashed with SHA-256 before persistence. Raw IDs, JIDs, captions, file names and payload bytes are not stored in the idempotency ledger.
- `claimWebhookEvent()` uses the same local-host cross-process lock and persists a `processing` claim before the Baileys send side effect.
- `completeWebhookEvent()` records only bounded counts and a small outcome enum.
- Default retention is 24 hours, bounded to seven days by API options, with a 5,000-entry cap.
- A persisted claim is treated as consumed even if the process dies before delivery completes. This is an at-most-once strategy to prevent duplicate sends. A crash in the narrow interval after claim but before send can cause a missed event; operators must inspect source service logs and reconcile manually rather than retrying blindly.
- Corrupt idempotency state fails closed. The webhook handler returns an error instead of proceeding with an untracked send.

## 6. Files changed

- `src/utils/PersistentJsonStore.js` — strict JSON read, atomic write, backup and local file lock.
- `src/lib/energy-worker.js` — cross-process mutation lock, schema validation, backup/recovery, strict debit, timestamp-based passive regeneration.
- `src/middlewares/energy-worker.js` — stop command when atomic debit is rejected.
- `src/services/webhookRuntime.js` — persistent SHA-256 idempotency claims and bounded outcome records.
- `src/index.js` — persistent claim/complete integration for TEAMDROP and World Boss.
- `src/core/Loader.js` — deterministic plugin file ordering and source metadata.
- `src/core/PluginRegistry.js` — deterministic command/alias ownership and conflict report.
- `src/core/PluginManager.js` — atomic registry swap plus diagnostics.
- `src/plugins/owner/reload.js` — owner-visible conflict summary.
- `scripts/energy-ledger-recovery.mjs` — inspect and explicit backup restore.
- `test/stage60-data-integrity.test.js` — ten regression tests, including charging/debit reconciliation and no-write behavior for full batteries.
- `test/stage20-milestone.test.js` — updated passive regeneration assertion for timestamp-based implementation.
- `test/stage59-workload-threat-agent.test.js` — expected project version updated to 2.35.25.
- `package.json`, `package-lock.json`, `README.md`, `docs/README.md`, `docs/project/CHANGELOG.md` — release metadata and documentation.

## 7. Configuration and operations

No new required secret or external service is introduced. `WHISKAY_DATA_DIR` must point to the same local directory for processes that are expected to coordinate. Ensure the runtime user can create lock files and atomic temporary files in that directory.

The existing PM2 configuration uses `instances: 1` and `exec_mode: 'fork'`. The file lock protects same-host forks that share this directory, but enabling multiple machines against one shared JSON directory is unsupported. For multi-host or high-volume deployments, move transactional state to PostgreSQL or another database with transactional uniqueness/locking.

Webhook idempotency data is private runtime data under `data/`; do not include it, the Energy ledger, backups, `.env`, sessions or QR artifacts in release ZIPs or Git.

## 8. QA and limitations

- Stage 60: 11/11 passed.
- Combined focused cross-stage regression set (Energy, Stage 20, Stage 45, Stage 48 TEAMDROP, Stage 49 scheduler, Stages 52–60): 80/80 passed.
- Syntax check: PASS — `node --check` completed for 320 JavaScript/MJS/CJS files. Repository integrity: PASS — 321 source files scanned, 423 relative imports checked, zero missing imports, package-lock consistency PASS.
- Latest full `npm test`: 418/448 passed, 30 failed, zero skipped. The retained `node_modules` is incomplete because `npm ci --ignore-scripts --no-audit --no-fund` timed out; 25 failures explicitly identify missing `dotenv/config`, and five test wrappers report only generic `test failed` with their underlying subprocess causes unclassified. The TEAMDROP source-contract test was updated to assert persistent `claimWebhookEvent`/`completeWebhookEvent` and passes in the focused suite. Repeat full suite after a clean dependency install.
- No live WhatsApp send, TEAMDROP webhook, World Boss webhook, PM2 multi-process deployment or provider enforcement test was performed in this environment.

## 9. Migration and rollback

1. Stop the bot and back up the complete source, `.env`, `data/`, database, and Baileys sessions.
2. Deploy the source ZIP while retaining private runtime data.
3. Run `npm ci`, then `npm run energy:ledger:status` and the Stage 58–60 verification scripts.
4. Do not restore the Energy ledger unless status confirms the primary is invalid and backup valid. Keep the pre-restore archive for forensic review.
5. If rolling back code, retain `data/energy-ledger.json.bak` and `data/webhook-idempotency.json`; older code may ignore these files, but deleting them would remove recovery/deduplication state.
6. Do not restart multiple bot machines against one JSON data directory. Use one host/local filesystem or migrate to a transactional shared database first.

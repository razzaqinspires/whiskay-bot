# Stage 61 — Runtime Hardening & Multi-Instance Outbound Safety

**Release:** v2.35.26 · **Part:** 4 · **Date:** 2026-11-08

## Objective

Part 4 closes the gap between process-local outbound protection and a deployment where multiple independent Node.js workers or PM2 processes may share one host. It also makes the test runner fail early and clearly when an interrupted dependency install leaves the runtime incomplete.

The WhatsApp transport remains deliberately single-instance. Multi-worker refers to background analysis and local independent tasks, not multiple Baileys sockets using the same authentication session.

## Architecture changes

### Shared outbound policy ledger

New file: `src/core/OutboundPolicyStore.js`.

The store is the canonical cross-process gate for:

- global rolling per-minute outbound limits;
- per-recipient rolling per-minute limits;
- duplicate message-fingerprint suppression;
- source quarantine checks;
- global send-slot pacing immediately before transport;
- bounded event and blocked-decision retention.

All policy mutations run under the shared local filesystem lock and are persisted with the existing atomic JSON utility. Recipient identifiers and message fingerprints must be 24-character one-way hashes. The policy ledger does not persist raw JIDs, message content, credentials, or command arguments.

Corrupt JSON or schema-invalid state blocks outbound reservations. The system does not silently replace a damaged policy file with an empty permissive state.

### WorkloadTracker separation

File: `src/core/WorkloadTracker.js`.

- Local telemetry is stored per process in `workload-tracker-<instance>.json`.
- The canonical enforcement state is shared in `outbound-policy-state.json`.
- `NODE_APP_INSTANCE` (or `WHISKAY_INSTANCE_ID`) differentiates per-process telemetry.
- Quarantine updates are persisted to the shared policy store.
- Reservation, final send-slot acquisition, and completion are awaited by the outbound guard.

The per-process telemetry files are diagnostic shards. They are not authoritative for global outbound permission; only the shared policy ledger makes that decision.

### Final send boundary and quarantine recheck

File: `src/core/OutboundTrafficGuard.js`.

A request must first reserve policy capacity. Immediately before the original Baileys method is invoked, it obtains a globally coordinated send slot. The slot is shared between processes on the same host, preventing each process from independently using its own in-memory pacing interval.

A second quarantine check occurs at this final boundary. This matters when a message was already reserved and queued before the Threat Agent quarantined its source. In that case the queued event is marked failed and transport is never called. The caller receives `WHISKAY_OUTBOUND_SOURCE_QUARANTINED`, which lets a broadcast campaign stop rather than probing subsequent targets.

### PM2 and process topology

File: `config/ecosystem.config.cjs`.

PM2 intentionally remains:

- `instances: 1`;
- `exec_mode: 'fork'`;
- `instance_var: 'NODE_APP_INSTANCE'`.

`scripts/start.mjs` retains the single-instance startup lock. Do not increase PM2 instances for the Baileys bot while sharing one WhatsApp session. Background worker threads can process Threat Agent jobs independently, but they do not create extra WhatsApp sockets.

The policy store is **single-host/local-filesystem only**. It is not a distributed lock for separate machines, NFS, or arbitrary network filesystems. Multi-host deployment would require a database/Redis-backed atomic policy service and a separate design review.

## QA and dependency preflight

Files:

- `scripts/run-tests.mjs`
- `test/run-tests-script.test.js`
- `scripts/verify-ops.mjs`
- `test/stage61-multi-instance-safety.test.js`

The test runner now inspects all direct runtime dependencies before discovering and spawning the test suite. If required packages are missing, it exits with an explicit list and tells the operator to run `npm ci`. This prevents dozens of misleading subprocess failures when the environment contains a partially installed `node_modules` tree.

`verify-ops` now checks the persistent webhook claim/complete contract and that webhook dispatch fails closed when required allowlist configuration is absent.

New scripts:

- `npm run verify:stage61`
- `npm run verify:outbound-stability`

Stage 61 is included in `npm run verify:all`.

## Configuration and operations

No new mandatory environment values are introduced. The existing `WHISKAY_OUTBOUND_MIN_INTERVAL_MS` now applies at the shared final send slot as well as the local scheduler. The default remains conservative.

Before rollout:

1. Back up the source tree, `.env`, all `data/` stores, and Baileys session files.
2. Stop the existing bot before replacing source files.
3. Preserve the current `.env` and runtime data; do not copy a clean release's empty data files over production data.
4. Run `npm ci` from a working registry connection.
5. Run `npm run verify:stage61`, `npm run verify:outbound-stability`, `npm run verify:ops`, `npm run audit:repository`, and then `npm test`.
6. Keep PM2 at one fork instance and confirm `.workload status` reports healthy workers before reconnecting a live account.

Rollback: stop the process, restore the backed-up source tree and package metadata together, then restart from the preserved `.env`, database and session files. Do not roll back policy JSON while the bot is active; stop all local bot processes first and preserve the policy file for incident review.

## Verification results

- Stage 61: 9/9 passed.
- Part 4 selected cross-stage regression: 76/76 passed (current release rerun; the list includes Stages 48–61, upload whitespace, and the test-runner script tests).
- Part 3's explicit historical cross-stage set: 80/80 passed. The previous Part 3 report's 79/79 subsection was a documentation counting error; its final verdict already said 80/80. The exact listed files were rerun and confirmed 80/80.
- `scripts/verify-ops.mjs`: 8/8 checks passed.
- `node --check`: 323 JavaScript/MJS/CJS files passed.
- Repository integrity: 323 source files scanned, 426 relative imports checked, 0 missing imports, package-lock consistency PASS.
- Full `npm test`: BLOCKED at dependency preflight because the current workspace lacks eight direct runtime packages. `npm ci --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=30000` failed to reach the npm registry with DNS `EAI_AGAIN`. No full-suite pass is claimed.

## Not established by this stage

- This stage does not prove that an earlier WhatsApp ban was caused by any one command or traffic pattern.
- No live WhatsApp session or provider enforcement diagnostic was available for testing.
- File-lock coordination across separate hosts or network filesystems is unsupported.
- The global file-backed policy has additional disk I/O and should be monitored under real deployment load.

See [the Stage 61 QA report](reports/TEST-REPORT-STAGE-61-RUNTIME-HARDENING-MULTI-INSTANCE-SAFETY.md).

# Test Report — Stage 61 Runtime Hardening & Multi-Instance Outbound Safety

**Release:** v2.35.26 · **Date:** 2026-11-08

## Focused Stage 61 tests

Command:

```bash
node --test test/stage61-multi-instance-safety.test.js
```

Result: **9 passed / 9 total / 0 failed / 0 skipped**.

Coverage:

1. Global outbound rolling limit shared across ten independent Node processes.
2. Per-recipient rolling limit shared across independent processes.
3. Duplicate fingerprint claimed only once across independent processes.
4. Source quarantine set by one process blocks another process.
5. A queued reservation is rejected if its source is quarantined before the final send slot; the event becomes failed and a policy-block record is retained.
6. Global send-slot interval is shared across processes.
7. Corrupt policy JSON fails closed and the original bytes remain unchanged.
8. Schema-invalid timestamps fail closed without rewriting the shared policy state.
9. PM2 remains one forked Baileys instance and startup keeps its single-instance lock.

## Part 4 selected cross-stage regression

The current Part 4 regression command covers:

- Stage 48 TEAMDROP relay contract;
- Stage 49 WorkloadScheduler;
- Stages 52–57 repository structure, integrity, plugin command intelligence and Git recovery;
- Stages 58–61 outbound safety, threat agent, data integrity and multi-instance safety;
- upload whitespace hotfix;
- test-runner dependency preflight.

Result: **76 passed / 76 total / 0 failed / 0 skipped**.

## Part 3 historical report correction

The explicit Part 3 cross-stage test list was rerun independently:

```bash
node --test \
  test/energy-worker.test.js \
  test/stage20-milestone.test.js \
  test/stage45-energy-intelligence.test.js \
  test/stage45-energy-saver-actions.test.js \
  test/stage45-energy-notification.test.js \
  test/stage48-teamdrop-relay.test.js \
  test/stage49-part3-workload-scheduler.test.js \
  test/stage52-repository-structure.test.js \
  test/stage53-git-upload.test.js \
  test/stage54-repository-integrity.test.js \
  test/stage55-plugin-command-intelligence.test.js \
  test/stage56-git-upload-intelligence.test.js \
  test/stage57-git-upload-recovery.test.js \
  test/stage58-outbound-safety.test.js \
  test/stage59-workload-threat-agent.test.js \
  test/stage60-data-integrity.test.js
```

Result: **80 passed / 80 total / 0 failed / 0 skipped**. This confirms the 80/80 final verdict in the Part 3 report and corrects its stale 79/79 subsection count.

## Operational verification

`node scripts/verify-ops.mjs`:

- public health endpoint — PASS;
- constant-time secret comparison — PASS;
- request rate limit — PASS;
- persistent webhook idempotency claim — PASS;
- webhook handler fail-closed behavior — PASS;
- configurable target allowlist — PASS;
- owner ops commands registered — PASS;
- metrics service exports — PASS.

`node scripts/repository-integrity.mjs`:

```text
Repository integrity: PASS
Source files scanned: 323
Relative imports checked: 426
Missing relative imports: 0
package-lock consistency: PASS
```

Syntax validation:

```text
node --check files: 323
failed: 0
```

## Full suite and dependency status

Full `npm test` could not be executed because direct runtime dependencies are not installed in the current workspace. The test runner's new dependency preflight exits before launching child tests and lists:

```text
@hapi/boom
@whiskeysockets/baileys
chess.js
chokidar
dotenv
pino
pino-pretty
qrcode-terminal
```

A clean install was attempted:

```bash
npm ci --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=30000
```

The environment could not resolve the configured npm registry and returned `EAI_AGAIN`. The partial `node_modules` tree is not considered valid. After network access is restored, run `npm ci` and then `npm test` again. This report does not claim the full suite passed.

## Deployment limits and untested behavior

- No live WhatsApp account or Baileys session was connected.
- No provider ban reason, enforcement notice or live delivery logs were available.
- Process coordination is verified across independent local Node processes on one filesystem, not across multiple hosts or network filesystems.
- PM2 remains a single forked Baileys instance. The worker pool is for background analysis only.
- Throughput, filesystem latency and policy-store contention need observation in a staged runtime before enabling the bot for real traffic.

## Verdict

**Stage 61 PASS (9/9). Part 4 selected cross-stage regression PASS (76/76). Part 3 historical cross-stage regression corrected and confirmed PASS (80/80). `verify-ops` PASS (8/8). Syntax PASS (323 files). Repository integrity PASS. Full `npm test` BLOCKED by npm registry DNS/dependency installation, not reported as PASS. Live production readiness is not established.**

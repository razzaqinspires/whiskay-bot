# Stage 66 — Autonomous Git Upload Repair

## Confirmed incident
The supplied 2026-11-09 log shows `git diff --cached --check` blocked the snapshot because `.github/workflows/ci.yml:125` had trailing whitespace. Git's `--check` is intended to reject trailing whitespace and conflict markers; the failure is a validation guard working as configured, not proof of a GitHub outage.

## Confirmed fix
The whitespace at `.github/workflows/ci.yml:125` reported in the supplied log was removed in this release. A regression test asserts that line remains clean.

## Architecture
1. `scripts/git-upload-repair.mjs` runs before the staged whitespace gate in snapshot and publish. It touches only changed, staged, allowlisted source/config files; removes trailing spaces/tabs while preserving line endings; writes original bytes under ignored `data/test-reports/git-upload-repair/<run-id>/deterministic/`; stages only repaired paths.
2. If deterministic repair cannot clear the check, `scripts/auto-push.sh` optionally invokes `scripts/nexora-git-repair.mjs` when `NEXORA_GIT_REPAIR_ENABLED=true`.
3. NEXORA uses the existing `OPENAI_API_KEYS` / `OPENAI_API_KEY` and `GEMINI_API_KEYS` / `GEMINI_API_KEY` configuration, honors `AI_PROVIDER` preference, and rotates through available keys/providers. It does not print keys.
4. NEXORA may only return complete contents for exact already-staged files in source/config allowlisted directories. It cannot create files, change paths, edit `.github/workflows/`, `package.json`, upload/security guard scripts, runtime/session/credential directories, execute model-provided commands, or alter Git branch/push policy.
5. Each AI attempt gets a private backup and failure record under `data/test-reports/nexora-repair/<run-id>/attempt-N/`. Maximum attempts is three. Changed JavaScript is syntax-checked and `npm test` must pass before the repair is accepted and staged. If validation fails, the exact pre-attempt bytes are restored before trying the next provider/key.
6. Remote push now retries the normal non-force push up to three times with bounded waits, then tries the existing GitHub CLI and token variables (`GH_TOKEN`, `GITHUB_TOKEN`, `WHISKAY_GITHUB_TOKEN`, `WHISKAY_GITHUB_SYNC_TOKEN`).

All existing secret scanning, private-data protection, conflict-marker checks, upload-branch-only policy, PR workflow, and QA reporting remain mandatory.

## Configuration
- `NEXORA_GIT_REPAIR_ENABLED=false` by default; explicitly opt in to enable AI code changes.
- `NEXORA_GIT_REPAIR_MAX_ATTEMPTS=3` (hard-capped at 3).
- `NEXORA_GIT_REPAIR_TEST_TIMEOUT_MS=120000`.
- Optional model overrides: `NEXORA_GIT_REPAIR_OPENAI_MODEL`, `NEXORA_GIT_REPAIR_GEMINI_MODEL`.
- API keys are reused from the existing Nexora multi-key settings. Never commit real keys; put them only in local `.env`.

## Commands
- `npm run repair:git-upload` runs deterministic repair on the current staged changes.
- `npm run repair:nexora` invokes the opt-in AI repair against staged changes.
- Normal `git upload` runs deterministic repair automatically during snapshot and publish. NEXORA fallback runs only when enabled and the deterministic gate still fails.
- `npm run verify:stage66` runs isolated policy tests.

## Safety and delivery semantics
No software can guarantee a remote upload regardless of DNS, network, GitHub availability, revoked credentials, branch protection, rate limits, or server policy. This stage improves local repair and retries without weakening these controls. It never force-pushes `main`, bypasses required CI, or uploads private data. A failed repair remains blocked and preserves the original files plus attempt logs for diagnosis.

## Rollback
Set `NEXORA_GIT_REPAIR_ENABLED=false` or remove the two repair invocations from `scripts/auto-push.sh`. Deterministic backups remain local under ignored `data/test-reports/`. No runtime database/session migration is introduced.

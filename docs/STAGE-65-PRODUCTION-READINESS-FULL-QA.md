# Stage 65 — Production Readiness & Full QA

## Scope
Dependency recovery diagnostics, production deployment validation, process health snapshot, and deterministic backup recovery simulation. This stage does not activate a WhatsApp account or alter session credentials.

## Files
- `scripts/production-readiness.mjs`: dependency, manifest/lockfile, required-file, runtime, disk, memory and recovery checks.
- `test/stage65-production-readiness.test.js`: isolated tests for the readiness checks.
- `package.json`: `doctor:production`, `health:production`, `verify:stage65` and aggregate gate.
- `docs/reports/TEST-REPORT-STAGE-65-PRODUCTION-READINESS.md`: observed QA and blockers.

## Commands
- `npm run doctor:production`: validates deployable project files, dependency lock consistency, runtime dependencies and root-level secret file warning.
- `npm run health:production`: emits JSON with Node version, dependency state, disk availability, memory and process identity.
- `npm run verify:stage65`: runs isolated readiness/recovery tests.
- `npm run verify:all`: includes Stage 65 at the end.

## Dependency recovery procedure
1. Confirm DNS and registry connectivity: `npm ping --registry=https://registry.npmjs.org/`.
2. Inspect lock consistency: `npm ls --depth=0`.
3. Run `npm ci --no-audit --no-fund` on a stable network. `npm ci` is lockfile-driven and removes the existing `node_modules`; never run while the bot is active.
4. If registry access is unstable, preserve the lockfile, repair DNS/proxy/registry configuration, then retry. Do not delete `package-lock.json`, use `--force`, or replace exact versions to bypass an install error.
5. Run `npm audit --omit=dev` and review each finding before updating dependencies.

## Health and deployment semantics
The health snapshot is a local process diagnostic, not proof of WhatsApp connectivity. A healthy process must still be verified against Baileys connection state, database/storage state, webhook ingress, and tunnel status before production activation. The disk threshold is a conservative 128 MiB warning boundary and should be tuned to deployment volume.

## Recovery simulation
The test creates an isolated temporary state file, corrupts the primary, restores from a verified backup using an atomic rename, and deletes the temporary directory. It does not touch real `data/`, `sessions/`, or credentials.

## Rollback
Remove the Stage 65 scripts/test and revert the package scripts/version to the previous release. No database schema migration or credential rotation is introduced.

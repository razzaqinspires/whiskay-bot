# Stage 52 — Repository Structure Test Report

**Release:** `2.35.15`  
**Date:** 2026-11-01  
**Status:** Partial verification complete; full dependency-backed suite blocked by package-registry DNS failure.

## Scope

- Root regular-file allowlist and root Markdown placement.
- Project documentation and legal notice relocation.
- Pairing helper and PM2 configuration paths.
- Active `.github/` directory and archived legacy workflow copy.
- Removal of duplicate templates/ignore files and unreferenced source backups; local QA report ignore/tracking policy.
- README, package metadata, lockfile and Git upload script references.

## Results

| Check | Result | Detail |
|---|---|---|
| `npm run verify:stage52` equivalent (`node --test test/stage52-repository-structure.test.js`) | PASS after v2.35.22 contract correction | Checks that local `data/test-reports/` content remains ignored/untracked; no deletion of operator report archives is required. |
| Node.js syntax | PASS | 314 `.js`, `.mjs`, and `.cjs` files checked with `node --check`. |
| Shell syntax | PASS | 3 scripts checked with `bash -n`. |
| Python syntax | PASS | 4 automation scripts compiled with `py_compile`; generated `__pycache__` removed. |
| JSON parse | PASS | 38 non-archived JSON files parsed successfully. |
| Release ZIP integrity and content filter | PASS | ZIP integrity checked; `.env`, sessions, mutable runtime data, generated reports, caches and installed dependencies are absent; `.env.example` and `assets/dungeon/floors.json` are retained. |
| `npm ci --no-audit --no-fund` | BLOCKED | npm registry requests failed with `EAI_AGAIN` (DNS/network unavailable); partial `node_modules/` was removed. |
| Full `npm test` / `npm run verify:all` | NOT RUN | Required dependencies could not be installed. Do not treat the full suite as passing. |

## Interpretation

The repository-layout and syntax checks pass. Dependency-backed unit/integration regression coverage remains unverified in this environment because npm could not resolve the package registry. Re-run `npm ci --no-audit --no-fund`, then `npm test` and `npm run verify:all` on a network-enabled host.

These checks do not prove live WhatsApp delivery, PM2 operation, external API credentials, GitHub remote permissions or deployed tunnel connectivity.


## Stage 54 and runtime-report contract corrections (2026-11-02)

The original Stage 52 test required `docs/archive/patches/whiskay-local-fix-1.patch` to exist. That expectation was superseded by Stage 54: the patch contains credential-like fixtures and is now a local-only ignored artifact, not a tracked release file. The structural test now checks the `.gitignore` exclusion and confirms that the patch is not tracked when a Git index is available. The local file is optional and is never deleted by this test.


Stage 52 no longer requires the local `data/test-reports/` directory to be absent or contain only `README.txt`. Prior QA ZIPs and Markdown reports are useful operator diagnostics and must survive. The test now verifies that the path remains ignored and that Git tracks no files beneath it; it never deletes or inspects the contents of an operator's report directory.

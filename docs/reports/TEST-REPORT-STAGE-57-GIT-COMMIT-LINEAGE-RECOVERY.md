# Stage 57 Test Report — Git Commit Lineage & Recovery Intelligence

**Release:** `whiskay-bot@2.35.20`  
**Date:** 2 November 2026  
**Runtime used for this build:** Node.js 22.16.0 in the build container; owner runtime reported as Node.js 20.20.2.

## Changes covered

- Resume an existing `upload/*` branch instead of rejecting it or creating a second upload branch.
- Preserve existing upload branches and snapshot commits during dry-run and failed sync attempts.
- Audit merge-base, ahead/behind counts, pending commit lineage, and patch-equivalent commits using `git cherry`.
- Block empty PR creation when all pending commit patches already exist in base.
- Keep recovery analysis read-only; it does not reset, rebase, amend, cherry-pick, force-push, or delete commits.
- Fix Stage 53 dungeon-data test to verify Git tracking state instead of asserting that an ignored local runtime file must be physically absent.
- Capture `npm audit --json` details in upload QA and mark QA as failed when High/Critical advisories exist or audit service is unavailable.

## Focused test results

| Suite | Passed | Failed |
|---|---:|---:|
| Stage 52 | 6 | 0 |
| Stage 53 | 6 | 0 |
| Stage 54 | 3 | 0 |
| Stage 55 | 4 | 0 |
| Stage 56 | 4 | 0 |
| Stage 57 | 5 | 0 |
| **Total** | **28** | **0** |

Additional checks:

- `npm run audit:repository`: PASS; 308 source files scanned, 397 relative imports checked, 0 missing imports, package-lock consistency PASS.
- `bash -n scripts/git-upload.sh scripts/auto-push.sh`: PASS.
- `node --check scripts/git-upload-recovery.mjs`: PASS.
- Disposable QA fixture with 2 Critical advisories: correctly emitted `NPM_AUDIT_RESULT=FAIL_HIGH_OR_CRITICAL` and `QA_RESULT=FAIL` (exit 1).

## Important unresolved dependency advisories

The owner terminal reported **2 Critical** vulnerabilities during `npm ci`. This build environment could not query the npm audit registry because DNS returned `EAI_AGAIN`; therefore the actual package names, advisory IDs, affected ranges, and compatible patched versions were unavailable. No dependency was upgraded blindly and no `npm audit fix --force` was run.

Stage 57 now saves the complete `npm audit --json` result and stderr in each upload QA log directory. It blocks a clean QA result for High/Critical findings or an unavailable audit service. On the owner host, run:

```bash
npm audit --json > data/test-reports/npm-audit-stage57.json
```

Share that JSON to identify safe package-specific upgrades. Do not run `npm audit fix --force` without reviewing the breaking-change impact.

## Scope limitation

The full `npm test` suite was not rerun for this build. The report records the focused Stage 52–57 suites and repository/syntax checks above. GitHub push/PR was not attempted because this build workspace has no owner Git remote/authenticated repository metadata.

# Test Report — Stage 56 Git History & Move Intelligence

- Release: `whiskay-bot@2.35.19`
- Date: 2 November 2026
- Scope: Git history inspection, staged/unstaged rename detection, staged-add/worktree-delete (`AD`) recovery, canonical `scripts/` relocation, ambiguity guard.

## Focused verification

| Check | Result |
|---|---:|
| Stage 52 repository structure | 6/6 PASS |
| Stage 53 Git upload/data protection | 6/6 PASS |
| Stage 54 repository integrity | 3/3 PASS |
| Stage 55 plugin intelligence | 4/4 PASS |
| Stage 56 Git move intelligence | 4/4 PASS |
| Repository integrity audit | PASS — 306 source files, 397 relative imports, 0 missing |
| `package.json` / `package-lock.json` | PASS — version 2.35.19 |
| Shell syntax (`git-upload.sh`, `auto-push.sh`) | PASS |
| Node syntax (`git-upload-intelligence.mjs`) | PASS |

## Stage 56 scenarios tested

1. A committed root shell script with a near-identical `scripts/` counterpart is reconciled to the canonical `scripts/` path; the obsolete root copy is removed and Git detects the rename.
2. `AD` state is reconstructed from the Git index blob even when the root file is missing from the working tree; matching replacement under `scripts/` is preserved.
3. A dissimilar root script is never deleted automatically; the helper returns `REVIEW_REQUIRED_NO_DELETE` and blocks the upload.
4. Launcher ordering is validated: history/move intelligence runs before secure snapshot, and snapshot runs before base-branch merge.

## Behavior and safety

- History inspection is read-only; no automatic reset, rebase, amend, or force push is performed.
- Only a root `*.sh` file with a same-basename `scripts/*.sh` candidate is eligible for automatic move reconciliation.
- Content similarity threshold is 65%; lower-confidence pairs are preserved and block upload for manual review.
- The canonical `scripts/` file is never removed by this reconciliation.
- After staging, a second verification blocks any remaining tracked root duplicate.
- Existing secret, private-data, whitespace, QA, and upload-branch protections remain in force.

## Limitations

The full `npm test` regression suite was not run in this Stage 56 workspace. The results above are focused stage tests and repository integrity checks only. GitHub push/PR was not attempted because this workspace is an exported source tree without the user's `.git` metadata or authenticated remote.

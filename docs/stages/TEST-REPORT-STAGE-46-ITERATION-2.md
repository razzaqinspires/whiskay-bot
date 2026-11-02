# Stage 46 Iteration 2 — Test Report

**Release:** v2.35.1

## Results

| Test group | Result |
|---|---:|
| Stage 46 startup/config/GitHub tests | **12/12 passed** |
| Stage 42 Cloudflared resolver regression | **2/2 passed** |
| Stage 45 adaptive energy regressions | **10/10 passed** |
| Combined targeted run | **24/24 passed** |
| `bash -n scripts/auto-push.sh` | **Passed** |
| JS/MJS/CJS syntax scan | **257 files, 0 syntax errors** |
| `.env.example` / config schema parity | **90 keys, 0 missing, 0 extras** |
| `package.json` / `package-lock.json` | **v2.35.1 consistent** |
| `src/core/serializer-compat.cjs` vs Stage 46 Iteration 1 | **Identical** |
| Release ZIP integrity | **Passed** |

## Added regression coverage

- Push an existing local commit with a clean working tree.
- Reject an approval if `HEAD` changes after analysis, even when the new commit leaves no uncommitted working-tree diff.
- Preserve stale working-tree approval rejection and assertions that the upload script contains no destructive hard-reset, stash or auto-rebase commands.
- Existing startup diagnostics, Cloudflared fallback, owner-bound button workflow, `.env` schema metadata and Stage 45 energy behavior remain covered by the focused run.

## Not verified on a production host

No public GitHub push, WhatsApp login/native-button delivery or Cloudflare tunnel process was started. The target server must still have a valid Cloudflared executable for its CPU architecture and executable permission. `npm test` / `verify:all` was not run because this extracted workspace has no installed `node_modules`; the release includes the lockfile for `npm ci`.

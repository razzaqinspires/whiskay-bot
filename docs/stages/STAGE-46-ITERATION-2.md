# Stage 46 — Iteration 2: GitHub Approval and Retry Hardening

**Release:** Whiskay Bot v2.35.1  
**Developer:** Arifi Razzaq

## Changes

The GitHub approval fingerprint now includes the exact `HEAD` commit hash as well as the working-tree status, tracked diff and untracked-file hashes. A commit created after review therefore invalidates the old approval even when the working tree is clean.

The push action now handles both paths: it commits staged changes when present, or reuses existing local commits when the previous network push failed after commit creation. It calculates `origin/main..HEAD` after the commit decision and pushes only when at least one local commit is ahead. The workflow still rejects a local branch that is behind/diverged from `origin/main`; no automatic reset, stash, workflow patch or rebase is performed.

## GitHub button flow

`.gitpush` → **Analisis Repository** → **Jalankan QA** → **Commit & Push**. Approval is owner/sender/chat-bound, expires after 20 minutes, and is invalidated by any content or HEAD change. The shell repeats remote ancestry, staged secret and identity checks at confirmation time.

## Deployment reminder

After a push failure, the commit is retained locally. Run `.gitpush analyze` and `.gitpush qa` again; after approval, the workflow will now push the already-created commit even if `git status` is clean.


## Verification

The targeted test run passes 24/24: Stage 46 12/12, Stage 42 2/2, Stage 45 10/10. `bash -n scripts/auto-push.sh` also passes. Live WhatsApp, production tunnel and actual public Git push remain deployment checks.

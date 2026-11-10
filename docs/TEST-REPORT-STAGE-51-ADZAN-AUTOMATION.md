# Stage 51 Part 8 — Test Report

Release: Whiskay Bot 2.35.12 · 2026-11-01

## Focused checks

| Area | Result |
|---|---:|
| Personal automation defaults and range validation | PASS |
| IANA local-time conversion and daylight-saving gap rejection | PASS |
| Friday reminder scheduling, private delivery and deduplication | PASS |
| Ramadan Sahur scheduling before Fajr | PASS |
| Ramadan Iftar scheduling relative to Maghrib | PASS |
| Stale queued-event cancellation after timezone/profile changes | PASS |
| Private command handlers and group restrictions | PASS |
| Git upload launcher Bash syntax and executable permission | PASS |

The focused automation suite contains seven tests. The Git launcher check is separate. Full `npm test` / `verify:all` and live WhatsApp delivery were not performed in the packaging environment. Baileys send behavior is covered with a mock socket only; owner-host validation is still required.

## Git upload permission repair

- `scripts/git-upload.sh` is shipped with Unix mode `0755` and resolves its own repository directory instead of hard-coding `/root/whiskay-bot`.
- `scripts/install-git-upload-alias.sh` restores mode `0755` and sets a repository-local `upload` alias that invokes the script through `bash`, avoiding direct-exec permission failures if a later copy loses its executable bit.
- Run `bash scripts/install-git-upload-alias.sh` once from the repository, or `npm run fix:git-upload`.
- The workflow remains review-first: analyze → QA → fingerprint validation → push. It does not reset, stash or auto-rebase.

## Packaging security

The release ZIP excludes `.env`, Baileys sessions, pairing tickets, runtime databases, cache, saved images and generated test reports. `.env.example`, source code, tests, docs and the static dungeon floor seed are retained.

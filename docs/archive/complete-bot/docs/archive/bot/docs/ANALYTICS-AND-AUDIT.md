# Operational history, audit, and visitor analytics

## Separate the signals

1. **Git update history** records source changes: commit SHA, actor login, event, branch, timestamp, and commit message. It must not contain secrets or runtime user data.
2. **Bot runtime logs** support troubleshooting and should remain on the bot host or a private observability system with retention controls. Avoid message bodies and unnecessary phone identifiers.
3. **Website visitor analytics** must be captured by `razzaq-ventures-platform`, because only the website sees page requests. The bot cannot infer page views from its WhatsApp commands.

## Current implementation boundary

`.github/workflows/repo-update-history.yml` appends metadata about a push to `docs/history/updates.jsonl`. This is not visitor tracking. The website repository README currently describes `/api/v1/integrations` as validation-only, with persistence and page-view analytics not enabled. Therefore no claim is made that web hits are currently stored in Supabase or GitHub.

## Suggested privacy-preserving website design

- Instrument page views at the website request or client navigation layer, not inside the WhatsApp bot.
- Prefer aggregate counters by day and route group; remove query strings that may contain identifiers.
- Do not persist raw IP addresses, cookies, authentication tokens, full user-agent strings, WhatsApp JIDs, or message content in a Git repository.
- Define notice/consent where required, a retention period, access controls, and a deletion procedure.
- Store raw events in a database or analytics service; expose only aggregated values through a validated server API.
- If a daily aggregate is exported to GitHub, keep the repository private, use a least-privilege token, avoid public Actions logs, and ensure no secrets are serialized into artifacts.

## Update ledger workflow

The workflow runs after source pushes and ignores commits that only change `docs/history/updates.jsonl`, preventing a commit loop. GitHub repository settings may still block `GITHUB_TOKEN` pushes; if so, the workflow will fail visibly and needs an approved permission change. Do not silently add a personal access token to the repository.

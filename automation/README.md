# Whiskay Automation Status

This folder is the bot-owned audit state. It is written only to the `automation` branch; it must never be copied back into `main` by the bot.

- Schedule: every 6 hours, plus a daily health audit at 03:00 UTC.
- Audit source: `main`, checked out read-only.
- Rolling config: `config.json`.
- Learned heuristics: `insights.json` (changed paths, commit authors, busy UTC hours).
- Append-only rules: `rules/`.
- Reports: `reports/YYYY-MM-DD.json`.
- Score: `self-score.json`.
- Incident log: `incidents/YYYY-MM-DD.log`.
- Human-readable anomaly notes: `self-review.md` and `digest/`.

The uptime value is explicitly a workflow-success proxy, not an assertion about WhatsApp service uptime. GitHub Actions cron can be delayed or skipped during high load. `main`, `develop`, `release/*`, and all branches other than `automation` are read-only targets for the bot.

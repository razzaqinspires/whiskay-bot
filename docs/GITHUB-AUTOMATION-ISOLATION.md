# GitHub automation isolation

## Ownership model

- `main` is human-owned. Workflows may read `main`, but automation must never push, commit, or use the Contents API to write there.
- `automation` is bot-owned state. Reports, metrics snapshots, learned insights, scores, incidents, and the status README are written there only.
- The scheduled autopilot runs every six hours, plus a daily 03:00 UTC health pass, and supports `workflow_dispatch`.
- Existing metrics/history workflows are retired as read-only manual stubs to stop the previous main-branch write loop.

## Recovery and safety

The workflow retries the audit up to three times with exponential backoff. On repeated failure it attempts a safe-mode audit and writes an incident log. Before pushing, it checks the current branch is exactly `automation` and rejects any staged change outside `automation/`. It does not force-push and does not reset a divergent automation branch automatically; doing so could erase reports. If the branch is missing, the workflow bootstraps it from `origin/main` and reapplies generated automation state.

## Self-improvement

- `automation/config.json`: rolling thresholds and verbosity.
- `automation/insights.json`: recent authors, changed paths, and busy UTC hours.
- `automation/rules/`: append-only baseline rule history.
- `automation/reports/YYYY-MM-DD.json`: daily report with run history.
- `automation/self-score.json`: completeness, guardrail accuracy, and workflow-success proxy.
- `automation/self-review.md`: anomaly review and hypotheses.
- `automation/incidents/YYYY-MM-DD.log`: errors and guardrail incidents.
- `automation/README.md` and `automation/digest/`: human-readable status.

Traffic metrics require `WHISKAY_GITHUB_TRAFFIC_TOKEN` with suitable repository traffic access. Without it, traffic is reported as unavailable rather than fabricated. The uptime score is only a workflow-success proxy, not actual WhatsApp uptime.

## Important boundaries

The bot does not rewrite workflow YAML automatically. Workflow changes are security-sensitive and must be proposed and reviewed separately. The generated config/rule state is versioned in Git, but this bootstrap version writes the automation state directly to the bot-owned `automation` branch; it does not implement automatic PR/auto-merge for each self-modification. If strict PR-only changes are required for config/rules too, enable a separate proposal-branch workflow and required CI checks before allowing auto-merge.

GitHub scheduled workflows are best-effort; cron jobs can be delayed. No workflow can guarantee a push to `main` will always succeed if a human pushes concurrently with another human, branch protection rejects it, or a separate third-party integration continues writing to `main`. This change removes the known bot writers in this repository once the PR is merged.

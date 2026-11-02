# Stage 45 Iteration 1 — Adaptive Energy Intelligence

## Scope
- Adaptive energy estimation from command classification, input size, historical command p95 latency, observed response payload, runtime pressure and workload class.
- Persistent rolling workload telemetry and concurrent-task/event-loop measurements.
- Button-first energy notifications with command-specific cost and cooldown breakdown.
- Energy saver unlock below 20%; auto-disable at/above 20%; dynamic energy discount and workload-specific cooldown multiplier.
- Signed owner-bound action tokens. First unauthorized attempt warns; second and subsequent attempts persistently block the actor from future saver-button actions.
- Menu labels: dynamic ⚡, static 📌, free · (0%).

## Architecture notes
`WorkloadTracker` measures process CPU, heap, RSS, event-loop delay, active task count, queue depth, per-command p50/p95 duration and response payload. Node's event loop permits concurrent asynchronous I/O; this implementation does not claim CPU-parallel worker_threads execution.

Energy decisions are deterministic bounded heuristics, not a remote AI call. This keeps the energy decision path available during network outages and prevents external model latency from charging users.

## Data files
- `data/energy-ledger.json` — existing energy balances and accounting.
- `data/energy-saver.json` — per-user saver preference.
- `data/energy-saver-actions.json` — button token ownership and persistent unauthorized-click restrictions.
- `data/workload-tracker.json` — bounded per-command telemetry history.

## Safety
- No energy charge for explicit free commands.
- Saver mode is only unlocked when energy is strictly below 20%.
- At energy >=20%, saver state is automatically disabled.
- Buttons are bound to the original user; another user receives one warning, then persistent button-action ban on repeat.
- If ledger reads/writes fail, paid commands are stopped rather than executed without accounting.

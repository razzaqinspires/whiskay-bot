# Stage 34 — Metric & Status Registry

All metrics below are operational measurements or deterministic heuristics. They are not measurements of consciousness, biological cortisol, or physical joules.

| Metric | Definition / unit | Source | Sampling / persistence | Status |
|---|---|---|---|---|
| `energy.available` | Remaining energy, percentage points | Energy ledger | Per command; persisted by existing ledger | IMPLEMENTED |
| `energy.estimated_cost` | Estimated cost before plugin execution, percentage points | `WorkloadCortex.estimateWorkload()` | Per command; attached to context | IMPLEMENTED |
| `energy.charged_cost` | Saver-adjusted charge, percentage points | `applyEnergySaver()` + ledger | Per command; ledger persists aggregate | IMPLEMENTED |
| `energy.rejected_insufficient` | Count of commands rejected before execution for insufficient energy | Energy middleware / `WorkloadTracker` task counters | In-process counters | PARTIAL: aggregate rejection count, not durable per-command series |
| `energy.saver_enabled` | User's saved saver preference | `data/energy-saver.json` | Atomic JSON rename, per user | IMPLEMENTED |
| `energy.saver_unlocked` | `available < 20%` | Workload/energy middleware | Calculated per command | IMPLEMENTED |
| `cooldown.multiplier` | 2.5× for eligible commands in saver below 20% | Cooldown middleware | Calculated per command | IMPLEMENTED |
| `workload.cpu_percent` | Process CPU delta over elapsed wall time, normalized by CPU core count | `WorkloadTracker.sample()` | On message/command; rolling max 60 samples | IMPLEMENTED, heuristic |
| `workload.heap_percent` | `heapUsed / heapTotal × 100` | Node `process.memoryUsage()` | On message/command; rolling max 60 samples | IMPLEMENTED |
| `workload.rss_mb` | Resident set size in MiB | Node `process.memoryUsage()` | On message/command | IMPLEMENTED |
| `workload.state` | NORMAL / HIGH / CRITICAL based on CPU/heap/queue heuristics | `WorkloadCortex` | Per sample | IMPLEMENTED, threshold-based |
| `task.started/completed/failed/rejected` | Counts of workload tasks | `WorkloadTracker` | In-process | IMPLEMENTED, resets on restart |
| `chronos.registered/running` | Number of registered jobs / currently executing jobs | `ChronosCortex.status()` | Scheduler tick | IMPLEMENTED |
| `chronos.success/failed/skipped` | Job run outcome counters | `ChronosCortex` | In-process | IMPLEMENTED, resets on restart |
| `reminder.pending/processing/sent/failed` | Reminder counts by delivery status | `reminderStats()` | On `.reminder audit`; JSON store | IMPLEMENTED |
| `reminder.delivery_guarantee` | Send and persistence are separate side effects | `ReminderManager` | Failure semantics | AT-LEAST-ONCE RISK: duplicate possible after crash |
| `syntax.checked/errors` | Number of JS files syntax-checked and error count | `SyntaxDoctor` | Up to 50 files / 5 minutes; JSON report | IMPLEMENTED, sampled subset |
| `quarantine.command_failures` | Three failures within 15 min causes 30-minute logical quarantine | `FailureMemoryShard` | Atomic JSON store | IMPLEMENTED |
| `typo.similarity_percent` | Edit-distance similarity × 100 | `typo-suggestions.js` | When command unknown | IMPLEMENTED; not intent probability |
| `intent.confidence` | Rule-based confidence score | `metacognitive-nexus.js` | Per AI request | IMPLEMENTED, heuristic; ambiguous multi-intent prompts trigger buttons |
| `memory.decay_weight` | `0.5^(age / half-life)` | `short-term-memory.js` | When history read | IMPLEMENTED, process-local |
| `meta.health_index` | Bounded deterministic score from workload, job failures, memory load, intent confidence | `MetaStateCortex` | On `.cortex status` | IMPLEMENTED, operational heuristic |
| `world.chunk_count` | `(2 × renderRadius + 1)^2` | RPG `WorldManager` | On world props/center change | IMPLEMENTED |
| `world.estimated_trees` | `chunk_count × treeDensity` | RPG `WorldManager` | `whiskay:world-telemetry` | IMPLEMENTED, estimate not visible rendered count |
| `world.fps/frame_time` | Real frame timing across target devices | Not instrumented in Stage 34 | Requires runtime profiling | MISSING |
| `api.provider_tokens/bytes/latency` | Real provider cost and HTTP payload measurements | Not instrumented end-to-end | Requires provider/request instrumentation | MISSING |
| `energy.forecast_1h` | Forecast from timestamped energy history | No durable time-series history yet | Future | MISSING |
| `nsfw.access_audit` | Durable per-access policy audit | Policy gate exists; complete audit sink not connected | Future | PARTIAL |

## Operational thresholds

- Energy Saver: unlocked only when energy is strictly below `20%`.
- Saver cost factor: `0.55×` of eligible original estimate (about 45% lower); cooldown multiplier `2.5×`.
- Workload score: `NORMAL < 50`, `ELEVATED 50–74.9`, `HIGH 75–89.9`, `CRITICAL ≥ 90`.
- Failure Memory Shard: 3 command failures in a rolling 15-minute window → 30-minute logical quarantine.
- SyntaxDoctor: max 50 `.js` files per run, each subprocess timeout 5 seconds.
- Reminder delivery: 3 attempts maximum; stale `processing` claim reclaimed after 5 minutes.
- World streaming: render radius bounded to 1–4 chunks; tree density bounded to 0–24 procedural trees per chunk.

## Reliability notes

Atomic rename protects against half-written JSON files but does not provide cross-process transactions. Keep one bot writer per local `data/` directory and back up it. Corrupt JSON is renamed to a `.corrupt-<timestamp>` sibling before a default store is initialized. `node_modules` is intentionally omitted from the source archive, so a full web build requires dependency installation first.

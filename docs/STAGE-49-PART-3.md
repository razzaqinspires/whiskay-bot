# Stage 49 — Part 3: Workload Scheduler

## Scope
- Add a bounded in-memory job scheduler with global concurrency and per-lane concurrency.
- Enforce a configurable minimum start interval between outbound jobs.
- Provide queue backpressure, pause/resume, cancellation checks and shutdown handling.
- Add owner-only `.workload status|pause|resume` controls.
- Keep workload telemetry separate from user XP and battery accounting.

## Configuration
- `WHISKAY_WORKER_CONCURRENCY` (default 3; clamped 1–16)
- `WHISKAY_WORKER_LANE_CONCURRENCY` (default 1; clamped 1–4)
- `WHISKAY_WORKER_MIN_INTERVAL_MS` (default 1200; clamped 0–60000)
- `WHISKAY_WORKER_MAX_QUEUE` (default 500; clamped 1–10000)

## Design and safety
Jobs are scheduled fairly by lane, with each lane serial by default. The queue is bounded and rejects overflow instead of consuming unbounded memory. Pause stops new starts while active jobs finish. Closing rejects pending work. Function closures are not persisted: pending jobs are not safe to replay after a process restart. Only telemetry/counters are persisted by `WorkloadTracker`.

This is a reliability, fairness and policy-rate-limiting mechanism. It does not attempt to bypass WhatsApp anti-abuse systems or disguise automation. Group invitations remain opt-in and subject to platform limits.

## Operations
- `.workload status`: inspect runtime, queue and counters.
- `.workload pause`: pause new queued work.
- `.workload resume`: resume queued work.

## Verification
Run `npm run verify:stage49-part3`.

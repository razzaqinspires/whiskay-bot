# Test Report — Stage 45 Iteration 1

## Targeted tests
`npm run verify:stage45`

- 10 tests passed, 0 failed.
- Explicit free command stays at zero energy and receives the saver cooldown multiplier.
- Network, AI and heavy workload classes produce differentiated estimates.
- Saver reduces energy cost and raises cooldown by workload class.
- Saver is locked at 20% and above.
- Workload shard reacts to event-loop delay and queue pressure.
- Energy notification is emitted once after command completion, includes runtime/payload details, and always includes quick-reply buttons.
- Owner-bound token is accepted; first unauthorized click warns; repeated attempt permanently blocks the actor.
- Unknown and expired tokens are rejected.

## Regression checks
- Stage 42 cloudflared tests: 2/2 passed.
- Stage 43 leveling/canvas tests: 6/6 passed.
- Stage 44 quiz-isolation/serializer test file: 7/7 passed.
- Syntax check: 248 JavaScript/MJS/CJS files, 0 syntax errors.

## Environment limitation
The combined Stage 44 command also invokes `stage41-game-transplant.test.js`, which could not import `dotenv` because dependencies are not installed in this extracted workspace. The Stage 44-specific regression file itself passed 7/7. The full repository suite and live WhatsApp deployment were not run.

## Measurement boundaries
- Runtime duration is measured around command execution.
- Response payload size is an estimate from serialized outbound response objects, not packet-level network bytes.
- Workload tracking observes concurrent asynchronous tasks, process CPU/heap and event-loop delay; it does not claim to execute CPU-parallel `worker_threads` jobs.
- Network speed between remote servers is not directly sampled unless an individual plugin adds explicit request instrumentation; network classification and historical command latency are used as proxies.

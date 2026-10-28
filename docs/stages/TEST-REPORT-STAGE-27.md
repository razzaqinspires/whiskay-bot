# Stage 27 Test Report — Bot

- `npm run verify:stage27`: PASS, 3/3 tests.
  1. Durable persistence across a newly created store instance and duplicate idempotency suppression.
  2. Exponential retry schedule and dead-letter transition.
  3. Rejection of disallowed event types and malformed payloads.
- `npm run verify:all`: PASS in this workspace, including retained Stage 23–27 and ops checks.
- Not covered: multi-process file locking, power-loss filesystem guarantees, real Supabase writes, network retries against deployed infrastructure, WhatsApp message delivery, or atomic business transactions.

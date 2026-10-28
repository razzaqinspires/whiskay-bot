# Stage 28 — Durable Event Processing & Transaction Safety

## Goal
Build on Stage 27's outbox by standardizing event envelopes, bounded idempotency, retry timing, and database transaction requirements. This stage does not claim distributed exactly-once delivery.

## Five literacies × five categories

### Literacy 1 — Event Envelope
1. Stable `event_id` UUID.
2. Namespaced `event_type`.
3. `occurred_at` ISO timestamp.
4. `schema_version` for evolution.
5. Object-only payload validation.

### Literacy 2 — Idempotent Processing
1. Duplicate detection by event ID.
2. Handler success required before marking seen.
3. Bounded in-memory cache to avoid unbounded growth.
4. Retry after handler failure.
5. Database unique constraints required across processes.

### Literacy 3 — Retry & Dead Letter
1. Exponential retry delay.
2. Maximum delay cap.
3. Jitter option to avoid synchronized retries.
4. Attempt count and last error should be persisted.
5. Dead-letter review and replay must be owner-authorized.

### Literacy 4 — Transaction Integrity
1. Economy mutations require database transactions/RPC.
2. Inventory and currency changes must commit together.
3. Use unique idempotency key per purchase/combat reward.
4. Never trust client-calculated price or damage.
5. Reconcile pending transactions after restart.

### Literacy 5 — Operations & Documentation
1. Add automated Stage 28 tests.
2. Preserve Stage 1–27 docs and source.
3. Update root README and changelog.
4. Document single-process limitations.
5. Require Supabase integration tests before production.

## Files
- `src/lib/stage28-event-processor.js` — event envelope, in-process dedupe, retry delay.
- `test/stage28-event-processor.test.js` — deterministic unit tests.

## Important limits
The idempotency map is process-local and is not durable. It is appropriate for unit tests and single-process orchestration only. Multi-instance production requires a database unique constraint plus atomic claim/lease semantics (e.g. `FOR UPDATE SKIP LOCKED`) and a transactional handler. No production exactly-once guarantee is made.

## Verification
Run `npm run verify:stage28` and `npm run verify:all`.

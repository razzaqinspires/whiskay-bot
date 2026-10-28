# Stage 26 — Reliability, Event Contracts & Cross-Platform Integrity (Bot)

**Version:** 2.12.0 · **Status:** foundations implemented; live integrations remain gated.

## Goals
Stage 26 makes message handling traceable and gives Bot/Web events a versioned, validated contract. It does not claim that webhook delivery, AI moderation, or distributed transactions are production-complete.

## Five literacies × five categories

### Literacy 1 — Message Pipeline & Core Context
1. **Correlation ID:** every serialized message receives a UUID and receive timestamp.
2. **Typed events:** handler emits `message:received` and `command:recognized` without message body content.
3. **Serializer impact:** `src/core/serializer.js` is updated to attach `ctx.event`, `ctx.correlationId`, and `ctx.receivedAt`.
4. **Handler impact:** `src/handlers/message.js` increments bounded counters and emits typed events.
5. **Compatibility:** `serializer-compat.cjs` remains untouched; existing `reply`/`send` contract is preserved.

### Literacy 2 — Reliability & Observability
1. **Counters:** received, commands, and errors are available from `getStage26Health()`.
2. **Privacy-safe telemetry:** no message body, token, or credential enters metric records.
3. **Error correlation:** future service/plugin logs should include `ctx.correlationId` where available.
4. **Resource bounds:** counters are fixed-key; no unbounded per-user label map is introduced.
5. **Tests:** Stage 26 tests verify unique IDs, data minimization, and counters.

### Literacy 3 — Security & Abuse Resistance
1. **Permission boundary:** owner/admin checks remain server-side and must be rechecked for every mutation.
2. **Rate limits:** sensitive APIs and Menfess/GitHub actions require per-JID and per-repository limits.
3. **Secret handling:** tokens only via environment variables or secret manager; never README or client bundles.
4. **Replay defence:** webhook consumers must verify signature, timestamp, and idempotency key before mutation.
5. **Auditability:** high-impact actions should record actor, action, correlation ID, and result without secrets.

### Literacy 4 — Bot ↔ Web Event Contract
1. **Event envelope:** event ID, type, timestamp, and object payload are mandatory.
2. **Allow-list:** event types must be explicitly registered; unknown types are rejected.
3. **Retry model:** delivery should use bounded retries and dead-letter logging when persistent storage is available.
4. **Idempotency:** receiver must store processed event IDs before applying economy or player mutations.
5. **Realtime UI:** publish only after authoritative server validation; client state is a projection, not truth.

### Literacy 5 — Release Engineering & Documentation
1. **Versioning:** Bot release advances to 2.12.0; release notes must describe behavior and migration requirements.
2. **Automated verification:** `npm run verify:stage26` and `npm run verify:all` are wired into scripts.
3. **Rollback:** retain previous ZIP/release and document config/schema rollback steps.
4. **Operational checklist:** test local startup, command path, permissions, reconnect, and graceful shutdown.
5. **Archive continuity:** Stage 1–25 records remain; README and docs index point to Stage 26.

## Validation
- `npm run verify:stage26` — two tests expected to pass.
- `node --check src/core/serializer.js` and `node --check src/handlers/message.js`.
- Full suite and live WhatsApp checks must be run in a dependency-installed environment.

## Not yet production-complete
Distributed event delivery, durable outbox, metrics endpoint, webhook signature verification, and live Bot/Web round-trip still require deployment secrets and integration testing.

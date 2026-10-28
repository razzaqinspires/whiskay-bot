# Stage 27 — Durable Event Outbox & Idempotent Processing

**Version:** Bot 2.13.0 / Web 2.7.0 · **Date:** 2026-10-29 · **Status:** foundation implemented; production worker integration is gated.

Stage 27 establishes durable event acceptance and retry semantics between WhiskayBot and RPG Companion. It intentionally does not claim exactly-once delivery: distributed systems generally provide at-least-once delivery plus idempotent consumers. Business effects must still use database transactions/unique constraints.

## Literasi 1 — Durable event lifecycle (5 categories)
1. **Event envelope:** stable `eventId`, allow-listed `type`, timestamp, object payload.
2. **Durable enqueue:** Bot `src/lib/durable-event-outbox.js` persists events to an atomic-renamed JSON file before returning.
3. **Idempotency key:** duplicate keys return the original event rather than adding another record.
4. **State machine:** `pending → delivered`, or retry with bounded exponential delay, then `dead`.
5. **Recovery and compaction:** re-opening the store reloads persisted pending records; delivered history can be compacted.

## Literasi 2 — Delivery reliability (5 categories)
1. **Retry backoff:** delays increase exponentially and are capped at one hour.
2. **Attempt ceiling:** default maximum eight failures before dead-letter status.
3. **Payload limits:** web contract rejects payloads above 64 KB and rejects non-object payloads.
4. **Observability:** `stats()` exposes bounded counts; error text is truncated to 500 characters.
5. **Operational recovery:** dead records require an operator-reviewed replay procedure; never replay payment/economy events blindly.

## Literasi 3 — Bot ↔ Web contract (5 categories)
1. **Allow-list:** eight event types are accepted; unknown privileged event types are rejected.
2. **Authenticated ingestion:** `POST /api/events/outbox` requires `BOT_SYNC_TOKEN` (or the existing `DUNGEON_SYNC_TOKEN` fallback).
3. **Persistent inbox/outbox:** `public.event_outbox` uses `event_id` as primary key.
4. **Duplicate suppression:** Supabase REST insert uses `resolution=ignore-duplicates`.
5. **RLS:** RLS is enabled without public policies; service-role credentials remain server-only.

## Literasi 4 — Economy and RPG safety (5 categories)
1. **Event-only transport:** the outbox records event facts; it is not itself an authority to grant currency.
2. **Idempotent effects:** coin, inventory, gacha and auction consumers must use unique transaction IDs and atomic DB/RPC transactions.
3. **Ordering:** consumers should order by persisted sequence/time per player; timestamps alone are not a global total order.
4. **Realtime:** publish notifications only after durable acceptance; clients should refetch trusted snapshots.
5. **Replay safety:** combat and economy events need expiry, authorization and a processed-event table before enabling automated replay.

## Literasi 5 — Documentation and release controls (5 categories)
1. **README:** root README gains Stage 27 scope, commands and production gates.
2. **Changelog:** version and file-level changes are recorded.
3. **Tests:** Node tests cover persistence, idempotency, retry/dead-letter and invalid events; web tests cover schema validation.
4. **Migration:** review and apply the SQL schema before turning on the endpoint.
5. **Release gate:** run `npm run verify:stage27` and `npm run verify:all`; do not claim live delivery without testing the deployed environment.

## Files
- Bot: `src/lib/durable-event-outbox.js`, `test/stage27-outbox.test.js`.
- Web: `lib/stage27/durable-event-contract.mjs`, `app/api/events/outbox/route.js`, `scripts/verify-stage27.mjs`.
- Database: `schema.sql` adds `public.event_outbox`.

## Bot usage example
```js
import { createDurableEventOutbox } from './src/lib/durable-event-outbox.js';
const outbox = createDurableEventOutbox();
const event = await outbox.enqueue({
  type: 'player.snapshot.updated',
  idempotencyKey: `snapshot:${playerId}:${revision}`,
  payload: { playerId, revision },
});
```
Use an actual stable player/revision identifier in production; never put access tokens or message bodies containing private data into generic event payloads. The file-backed queue is for a **single bot process on persistent storage**. It is not safe as a shared multi-replica queue or on ephemeral serverless storage; use a database-backed transactional outbox for that deployment model.

## Web ingestion
`POST /api/events/outbox` body: `{ "eventId": "event_00000001", "type": "world.event.updated", "timestamp": 1793232000000, "payload": { "weather": "rain" } }`. Send `Authorization: Bearer $BOT_SYNC_TOKEN`. The endpoint accepts and deduplicates events; a separate trusted worker still needs to claim pending rows, process effects, and mark them delivered/dead.

## Verification and limitations
- `npm run verify:stage27` runs local outbox and event-contract checks.
- SQL has not been applied to the user's Supabase project in this artifact.
- No background dispatcher is enabled by default. This prevents accidental repeated business effects before consumers implement idempotent transactions.
- Delivery is at-least-once by design; exactly-once external WhatsApp delivery cannot be guaranteed.

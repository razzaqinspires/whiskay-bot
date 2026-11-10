# Stage 51 Part 5 — Adzan Delivery Reliability & Control Center

## Durable delivery outbox

Every due personal prayer notification is written to `personalAdzanEvents` in `data/adzan-profiles.json` before WhatsApp delivery. The outbox stores recipient JID, prayer key, local prayer date, scheduled instant, rendered caption, audio preference, attempt count, next retry time, and last error. It does not store audio bytes.

The scheduler runs every 15 seconds. It enqueues due events inside a 10-minute grace window, then drains up to 100 due outbox entries per tick. Each item is claimed with a two-minute lease under the cross-process database lock, preventing two workers from sending the same pending item concurrently; expired leases are recoverable after a process crash. A queued event remains eligible after a process restart.

## Retry policy

| Attempt | Delay after failure |
|---|---:|
| 1 | 1 minute |
| 2 | 5 minutes |
| 3 | 15 minutes |
| 4 | 30 minutes |
| 5 | Mark `dead` |

Successful sends are marked `delivered`. A worker first moves an item to `sending` with a lease; if that worker crashes, another tick can reclaim it after the lease expires. Failed items remain `queued` until the next retry; after five failures they are retained as `dead` for owner diagnostics. Old event records are pruned by the existing profile-store retention logic.

### Delivery guarantee

This is **at-least-once**, not exactly-once. If the remote WhatsApp server accepts a message and the process crashes before `delivered` is persisted, the next retry may send a duplicate. Avoiding both message loss and duplicates requires an idempotency capability at the remote transport, which Baileys/WhatsApp does not expose for this message flow.

## Owner control center

- `.adzan admin` — owner-only summary of profile database, backup, audio file readiness, and outbox counts.
- `.adzan audio check` — check local Subuh/general MP3 readiness (same result as audio status).
- `.adzan audio on/off/status` — personal audio preference remains user-controlled in DM.

No command uploads or downloads recordings. Operators must supply audio they are authorized to distribute.

## Operational notes

- Audio delivery failure falls back to text; if both audio and text delivery fail, the outbox schedules a retry.
- Missing audio uses text and counts as a successful notification, not a retryable delivery failure.
- A 10-minute grace window can recover short outages. Events older than that are intentionally skipped rather than sent hours late.
- The outbox is stored in the same protected JSON database and inherits its atomic write, backup, schema validation, and cross-process lock behavior.

## Verification

Run `npm run verify:stage51-adzan-reliability`. Tests cover transient DM failure and retry, five-attempt dead-letter behavior, existing engine/audio integration, and owner-only diagnostics. Mock tests do not prove live WhatsApp delivery.

# Stage 49 — Part 5: Polling, Serializer & Final Regression

## Perubahan

- Socket `getMessage` now reads the bounded in-memory message store using the poll creation message key (`id` + `remoteJid`).
- Outgoing poll creation WAMessages are retained immediately after `sendMessage`, preserving the original message payload and `messageContextInfo.messageSecret` required by Baileys poll-vote decryption.
- Poll updates received through `messages.update` continue to use Baileys' decrypted `pollUpdates` structure and the full poll-creation WAMessage for aggregation.
- `messages.upsert` normalization accepts only already-decrypted `vote.selectedOptions`; encrypted `encPayload` / `encIv` data is not misrepresented as a decrypted vote.
- Existing `serializer-compat.cjs` behavior remains the source of truth for message serialization; only its existing bounded store API is reused.

## Why this matters

Baileys poll votes are encrypted. Its vote aggregation expects a stored poll creation message and decrypted updates. Returning a placeholder empty message from `getMessage` prevents the library from recovering the poll secret and can leave the vote aggregate empty. The new flow retains the sent poll and makes it retrievable by key.

## Verification

Run after installing dependencies:

```bash
npm ci
npm run verify:stage49-part5
npm run verify:stage44
```

The Part 5 regression tests validate encrypted-upsert rejection, decrypted-upsert normalization, poll-message retention, `getMessage` wiring, and use of the full poll WAMessage during aggregation.

Live WhatsApp poll voting must still be verified with an authenticated test group. Unit/static tests do not claim a live network test.

# QA Report — Stage 70.1

## Focused test command
`npm run verify:stage70-1`

Result: **6 passed, 0 failed**
- Persists messages and restores them in a fresh repository instance.
- Requires exact `remoteJid`, `id`, `fromMe`, and participant match.
- Preserves Buffer/Uint8Array message-secret bytes across JSON persistence.
- Rejects invalid identities and missing message payloads.
- Prunes entries after TTL expiry.
- Fails closed on corrupt repository schema.

## Static checks
- `node --check src/services/message-repository/MessageRepository.js` — PASS
- `node --check src/core/serializer-compat.cjs` — PASS
- `node --check src/core/Bot.js` — PASS
- `node --check test/stage70-1-message-repository.test.js` — PASS

## Not run / not claimed
- Full `npm test`.
- Full `npm run verify:all`.
- Live WhatsApp session.
- Actual Baileys retry and poll-decryption round trip.
- Long-running disk pressure / crash injection.
- Multi-process stress test.

## Risk note
The repository persists sensitive message payloads and message-secret material. Runtime data is excluded from source archives and must be access-restricted on the server.

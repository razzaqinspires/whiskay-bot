# Stage 41 Iteration 4 — Quiz Poll Authorization and One-Click Sessions

## Scope

- Bind each quiz poll to the user who started that quiz session. In group chats the poll remains visible to participants, but votes from any other user are silently ignored by the game handler.
- Accept only one valid poll selection from the designated user for each regular quiz round. The first accepted choice is consumed before asynchronous answer handling, preventing a quick second vote from being processed twice.
- End a regular quiz round after the designated user's first poll selection, whether correct or incorrect. This keeps the one-click rule consistent.
- Family 100 retains multi-answer gameplay by rotating to a fresh poll after each single selection; only the session creator can contribute answers. Each poll accepts at most one selection from that creator.
- Disable `.jawab` while a native poll is active so text commands cannot bypass the one-click poll. Text answer remains a fallback when poll creation is unavailable.
- Retain four distinct A–D options for every built-in quiz database row. Remote data continues to use bounded requests and local fallback records.
- Accumulate poll update payloads for Baileys vote aggregation rather than replacing prior update history on every `messages.update` event.

## Serializer / Baileys compatibility

The implementation was checked against `src/core/serializer.js`, `src/core/serializer-compat.cjs`, and `docs/BAILEYS-INTERACTIVE-COMPATIBILITY.md`. Sender identity uses the serializer's normalized sender plus participant/alternate participant JID fields when available, to account for PN/LID forms. Polls are sent through `sock.sendMessage(chat, { poll: { name, values, selectableCount: 1 } })`; vote updates are received through the socket's `messages.update` event and aggregated with Baileys `getAggregateVotesInPollMessage`.

## Tests

- All built-in quiz database rows generate four distinct A–D options containing at least one valid answer.
- The intended user's JID is accepted; unrelated JIDs are rejected.
- Static regression checks confirm first-vote consumption, active-poll `.jawab` blocking, and accumulated poll update handling.
- Existing Stage 41 quiz, image fallback, group menu, and Ular Tangga alias tests remain included.

## Verification limits

The Stage 41 test file passed 11/11 tests in this environment using a temporary `dotenv/config` shim because project dependencies were not installed. The shim was removed after testing and is not included in the release. Syntax checks and ZIP integrity checks are separate. Native WhatsApp poll visibility, actual Baileys poll vote decryption, PN/LID behavior on live devices, and third-party remote quiz data have not been end-to-end tested in a connected WhatsApp session.

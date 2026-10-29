# Stage 41 — Iteration 3: Quiz Polls and A–D Answer Data

## Scope
- Re-audited `Experimental-Bell-master/helpers/Events/game.js` against the current Whiskay quiz plugin.
- Adds four distinct multiple-choice options (A–D) for each of the ten quiz families, built from remote question records where available and local fallback records otherwise.
- Sends a native WhatsApp poll with `selectableCount: 1`.
- Handles Baileys `messages.update` events containing `pollUpdates` and resolves voters against the active poll using `getAggregateVotesInPollMessage`.
- Only the first vote per sender is counted for the active round; subsequent vote updates from that sender are ignored.
- `tebakgambar` sends a remote image only from an allow-listed source, with bundled local heart/clock image fallback; text `.jawab` remains as a fallback.
- Source game aliases `.dadu`, `.roll`, `.delsesiut`, and `.delulartangga` are mapped to the persisted Ular Tangga session with creator/admin/owner authorization.
- Poll timeout closes the round and reveals the answer.

## Compatibility and limits
- Family100 remains a multi-answer round: each A–D poll choice is one possible survey answer, and a correct choice records that answer. After a correct answer, the bot creates a new A–D poll from the remaining answers. Each player gets one poll attempt per Family100 round, so a single voter cannot farm answers.
- Remote question endpoints may fail or return a schema that cannot be normalized; local question data is used as fallback.
- Native poll display, vote decryption, and cross-client behavior cannot be certified by unit tests; they require a live WhatsApp session.
- Energy reward remains descriptive/configuration-only; no automatic energy credit is performed.

## Validation
See `TEST-REPORT-STAGE-41-ITERATION-3.md`.

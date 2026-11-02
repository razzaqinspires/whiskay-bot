# Stage 44 Iteration 1 — Quiz isolation, poll serializer, rewards

## Root causes
1. `classic-quiz.js` keyed every session only by `chat`, so all quiz families shared one slot and one timeout/poll owner.
2. Poll routing primarily observed `messages.update`; Baileys can also deliver the vote as a `pollUpdateMessage` in `messages.upsert`.
3. The poll aggregator received `sent.message` rather than the full poll-creation WAMessage returned by `sendMessage`.
4. Quiz reward values were only displayed as energy text and were not credited to the leveling database.

## Changes
- Session keys are now `chat::gameType`; separate games can run concurrently in the same chat.
- `.hint`, `.jawab`, `.nyerah`, and `.cleargame` accept an optional game type to target the intended session. Without a type, the latest active session belonging to the command sender is selected.
- Added a separate global leaderboard command for every quiz type (`.toptebakgambar`, `.toptebakanime`, `.topsusunkata`, etc.).
- `serializer.js` unwraps supported message wrappers and normalizes poll-update upserts. `serializer-compat.cjs` was not edited.
- Bot routes normalized poll-upsert events to the existing quiz poll handler while retaining `messages.update` handling.
- Poll state retains the full sent poll WAMessage for aggregate vote decryption.
- `awardQuizWin()` writes per-game XP/wins in `quizStats`, and credits XP/coins to the user's group profile in the same durable leveling database introduced in Stage 43.
- Every quiz type grants its configured XP reward and stores separate wins/XP statistics. Tebak Gambar and Tebak Anime each grant 35 XP + 5 coins per win; their stats and leaderboards remain separate. Family 100 grants its reward when all answers are completed.
- Tebak Gambar sends one image caption containing the question/options, a compact button message, and the native A–D poll; it no longer repeats the entire question body in a second text message.

## Commands
- `.toptebakgambar`
- `.toptebakanime`
- `.top<jenis-game>` for the other quiz leaderboards
- `.hint tebakgambar`
- `.jawab tebakanime naruto` (only when native poll creation failed)
- `.nyerah tebakgambar`
- `.cleargame tebakanime`

## Safety and limitations
- Only the session creator's first valid poll selection is processed; unauthorized voters are ignored.
- Native poll decryption and real WhatsApp event delivery cannot be proven by offline unit tests; verify on a linked test group.
- `serializer-compat.cjs` SHA-256 before and after this change: `793427ab35ea1fb6e8ddde3596e52b4343db8b82e08cbcba467b8a4d0156fcf7` (unchanged).

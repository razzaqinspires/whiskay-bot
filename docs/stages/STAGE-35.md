# Stage 35 — Chess, XP/Leveling, Energy Buttons, Typo & Feature Gap

## Literasi 6 — owner backlog yang dibawa ke implementasi
- `.catur @lawan` atau JID/nomor; chess.js rules engine; Canvas PNG rendering with text fallback; quick-reply recommendation and selectable legal-move list; chess leaderboard.
- XP for successfully executed commands, leveling progress, level-up notification and leaderboard/profile access.
- Energy low/insufficient notifications should expose quick actions, including charge, status and saver toggle.
- Unknown commands should offer typo suggestions with text similarity percentages and buttons.
- Audit Experimental-Bell and adapt missing ideas to Whiskay instead of wholesale copying.

## Implemented
- Chess command replaced pseudo-legal board logic with `chess.js`: legal moves, check, checkmate, castling, en passant, promotion, PGN/FEN persistence, challenge/accept/decline/stop, opponent authorization, move recommendations, legal-move list, and rating/win/draw/loss leaderboard.
- Canvas renderer is optional (`@napi-rs/canvas` is dynamically loaded if the deployment installs it); textual board fallback is not included as a full fallback image yet. The renderer emits a PNG when Canvas is available.
- Successful command execution awards 3–5 XP, increments points, applies a per-command 15-second duplicate XP cooldown, processes level thresholds, and announces level-ups. This is independent of the old group message-leveling toggle.
- Existing energy middleware already sends interactive actions for insufficient energy and low energy; retained and documented rather than duplicating a second notifier.
- Existing typo suggestion path remains enabled by default, gives similarity percentage, and offers quick replies. Stage 35 regression tests cover that integration surface.
- Package version bumped to 2.21.0. Stage docs and README/changelog updated.

## Feature-gap ledger: Experimental-Bell
- ADAPTED: declarative event concepts, command routing and interactive follow-up pattern; Whiskay continues using its own CommandHandler/PluginManager contracts.
- ADAPTED/PARTIAL: media/URL/mention preconditions; map to existing Whiskay context/middleware capabilities rather than duplicate the legacy event runtime.
- PARTIAL: locale discipline. Stage 35 chess strings still exist inline; central localization is a follow-up gap, not falsely marked complete.
- REVIEW REQUIRED: autoBackup detector and remaining source plugins. The public README demonstrates selected features, not a complete auditable inventory of every command in the repository. No claim that every Experimental-Bell feature has been copied.
- LICENSE: source repository declares MIT. Any future direct code reuse must preserve applicable copyright/license notices; this stage primarily adapts behavior and architecture.

## Validation & limitations
- Automated Stage 35 checks test command XP, typo similarity, and chess integration contracts.
- Real WhatsApp client rendering and button compatibility require live-device testing.
- Chess image rendering depends on optional `@napi-rs/canvas` being installed in deployment; without it, the command still works but sends no board image. Install it with `npm install @napi-rs/canvas` if native/prebuilt support is available for the target OS.
- npm registry access timed out in the build environment, so the dependency install itself could not be exercised here. Deployments should run `npm install` to resolve `chess.js` from the lockfile before starting.
- XP cooldown applies per command per user for 15 seconds to reduce command-spam farming; commands still execute normally during the cooldown but do not award duplicate XP for that same command.

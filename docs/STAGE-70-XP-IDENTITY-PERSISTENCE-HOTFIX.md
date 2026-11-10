# Part 12.1 — XP / Level Identity Persistence Hotfix

**Release:** WHISKAY-BOT v2.35.36  
**Baseline:** v2.35.35 Part 12  
**Date:** 10 November 2026

## Incident description
The user reports XP, level, rank, and related profile state repeatedly appearing at their initial values. The v2.35.35 source stores leveling profiles under a composite `group|user` key, but the user JID was used verbatim. Baileys 7 can expose a participant as either a phone-number JID (`@s.whatsapp.net`) or Linked ID (`@lid`). If the LID→PN pair is unavailable at first lookup, the same person can be written under two different keys. Reading the newly created key returns default level 1 / XP 0 while the old profile still exists.

This is a strongly supported source-level cause, not proof that every reported reset had this cause. The live production data directory was not included in the source ZIP, so the old records cannot be inspected or restored in this workspace.

## Implementation

### `src/lib/leveling.js`
- Database schema v4 adds `identities.lidToPn` while keeping schema v3 data readable.
- `registerLevelingIdentityAlias(lid, pn, source)` accepts only `@lid` → `@s.whatsapp.net` pairs.
- The same LID cannot silently be remapped to a different PN; conflicts are recorded in the audit log and rejected.
- Profile keys canonicalize both scope and user identity through the persisted alias map. Device suffixes are normalized.
- When a trusted mapping arrives, existing LID-keyed profile rows and quiz-stat rows are migrated to the PN key.
- Duplicate profile reconciliation chooses the higher cumulative level progression; coin, balance, points and familiarity use maximum values, never sum duplicate rows. This avoids accidental duplication of rewards.
- Leaderboard uses the same canonical scope and now includes derived rank in its row model. Rank remains derived from level; it is not a second mutable database field.
- `.leveldb status` includes the active database file, process working directory, and alias count.

### `src/core/serializer.js`
Before serializer compatibility conversion, trusted LID/PN alternatives present in message keys are persisted. This means a message carrying `participantAlt`, `participantPn`, `remoteJidAlt`, or `remoteJidPn` can register the mapping before the context is normalized.

### `src/core/Bot.js`
The Baileys `lid-mapping.update` event is now persisted into the leveling identity registry, in addition to the existing in-memory registry map.

### `src/plugins/owner/leveldb.js`
Status display now shows active file path, working directory, and mapping count for diagnosing accidental use of a second data directory.

## Data safety
- No production `data/leveling.json` was present in the source archive and no live data was rewritten.
- Existing schema v3 files remain readable. Schema upgrades occur on the next successful mutation.
- A conflicting mapping is never applied automatically.
- Existing XP is not reset, and duplicate profile XP is not summed.
- Friend-supplied Westmanga CommonJS source remains byte-identical. SHA-256: `59247bda46d1404cf643a76c4c34ba7bec95c90e3ef94095bdce2254bce4c20b`.

## Verification
`npm run verify:xp-persistence`

Focused validation performed in the build workspace:
- Stage 70 identity tests: 5/5.
- Stage 43 leveling storage/recovery tests: 6/6.
- Stage 32 leveling concurrency/regression tests: 5/5.
- Stage 68 protected library tests: 7/7.
- Stage 69 energy/menu tests: 9/9.
- Combined run totals: 32/32 tests passed.
- `node --check` passed for changed JavaScript files.

The Stage 44 test file could not be run in this workspace because dependencies are not installed (`dotenv` missing). Full `npm test`, `verify:all`, and live WhatsApp verification are not claimed as passed.

## Production activation and recovery procedure
1. Stop the bot.
2. Back up the complete active data directory, especially `leveling.json`, `.bak`, `archives/leveling/`, and any `.corrupt-*` files. Do not replace these files with source ZIP contents.
3. Install v2.35.36 source over the existing project while preserving the active `data/` directory and `.env`.
4. Run `npm ci --no-audit --no-fund`.
5. Run `npm run verify:xp-persistence`.
6. Start the bot and run `.leveldb status`. Confirm the active file path is the expected persistent data directory, primary status is VALID, profile count is nonzero, and XP total is plausible.
7. Ask one affected user to run `.profile` in the same group where their previous progress existed. Check `.leaderboard`.
8. If the database path differs from the previous deployment, stop and back up both locations before any manual migration. Do not copy/merge files while the bot is running.

## Rollback
Restore the v2.35.35 source files and keep the same data directory. Schema v4 remains compatible with the v2.35.35 reader because additional identity fields are optional and the existing `groups`, `users`, `quizStats`, and `audit` structure is retained. Keep a backup of the v4 database before rollback.

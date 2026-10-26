# Test Report — Group Control & Safety — 2026-10-26

## Environment

- Node.js ESM project; `node --test`.
- Tests use temporary directories for group policy so they do not touch production `data/` files.

## Results

- Full suite: **65 passed, 0 failed, 0 skipped**.
- New focused group-policy suite: **10 passed, 0 failed**.
- JavaScript syntax check: all files under `src/` and `test/` checked with `node --check`.

## New checks

1. Per-group mute persists and unmute restores command availability.
2. `onlyhere` suppresses every other group; reset removes only global mute policy.
3. Reset preserves per-group anti-toxic/text-guard settings.
4. Toxic filter is opt-in and supports word-boundary matching.
5. Custom ban-word phrases are detected.
6. Text Guard catches extreme repeated characters/words and excessive zero-width characters.
7. Unicode normalization removes invisible controls while preserving normal text.
8. Muted groups still permit owner recovery commands.
9. Plugin metadata exposes owner group control and group safety commands.
10. If group metadata is unavailable, the text guard avoids deleting messages based on uncertain role data.

## Not tested in this environment

- Live Baileys connection and real group participant metadata from the current WhatsApp account.
- Real message deletion, because it requires the bot to be admin in a test group.
- False-positive rates for the toxic dictionary across different languages.
- Multiple bot replicas sharing a policy file; JSON persistence is intended for one runtime instance and should be moved to a shared store for clustered deployments.
- Actual consciousness/AGI; the implementation explicitly makes no such claim.

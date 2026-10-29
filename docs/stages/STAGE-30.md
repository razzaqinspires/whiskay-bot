# Stage 30 — Context-Aware Recommendations & Input Boundaries

Date: 2026-10-29 · Bot version: 2.16.0

## Scope

1. Recommendation candidates are filtered by the active chat context and known command metadata before ranking. Group-only commands are not suggested in private chats; private-only commands are not suggested in groups.
2. Owner-only and premium commands are excluded unless the current context explicitly marks the user as owner/premium.
3. Commands with `limitCost` or `coinCost`/`modCoinCost` are only candidates when the context has sufficient limit/Mod Coin balance.
4. Plugin metadata may use `groupOnly`, `privateOnly`, `recommendable: false`, `coinCost`, or `modCoinCost` to describe eligibility. This only affects recommendations; the runtime command permission checks remain authoritative.
5. Tests cover private/group context, premium/owner/limit/coin filtering, and non-mutation of registry rows.

## Verification

- `npm run verify:stage30`
- `npm run verify:all`

## Limitations

The filter uses capability values supplied by the command context. The caller must populate `isOwner`, `isPremium`, `limit`, and `modCoins` accurately for full filtering. This is a recommendation UX guard, not an authorization boundary; each command must still enforce permissions when invoked. Persistent analytics and live production telemetry are not added in this stage.

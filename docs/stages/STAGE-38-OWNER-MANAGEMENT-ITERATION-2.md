# Stage 38 — Iteration 2: Owner data, moderation, and energy

**Reference:** [Experimental-Bell `helpers/Events/owner.js`](https://github.com/Rifza123/Experimental-Bell/blob/master/helpers/Events/owner.js), checked against the uploaded Whiskay ZIP. This is an adapted feature port, not a drop-in copy: the upstream handler uses its own `ev.on`, `cht`, `Exp`, archive memories, and global `Data` structures.

## Commands

| Command | Purpose | Safety contract |
|---|---|---|
| `.banned @target <duration|permanent> [reason]` / `.banuser` | Add app-level ban | Durations: `30m`, `2h`, `3d`, `1w`, or `permanent`; 1 minute minimum, 365 day maximum; cannot ban self or configured owners; unverified `@lid` identities are refused for ban operations because a LID cannot safely be equated to a phone-number owner. |
| `.unbanned @target` / `.unbanuser` | Remove app-level ban | Target must exist in Whiskay app database; writes who removed the ban and when. |
| `.addenergy @target <amount> [reason]` | Grant battery energy | Positive amount only, max request 10,000; final value clamped to capacity. |
| `.kurangenergy @target <amount> [reason]` | Reduce battery energy | Positive amount only, max request 10,000; final value clamped to zero. |
| `.getdata stats` | Display app DB counts | Does not serialize raw database files or sensitive fields. |
| `.getdata user @target` | Display a safe user summary | Only an explicit allowlist of user fields is rendered. |
| `.setdata user @target nickname <text>` | Set owner-only display nickname | Max 80 chars; does not update authentication or role. |
| `.setdata user @target note <text>` | Set owner-only note | Max 240 chars; newline/control chars are stripped. |
| `.deldata user @target nickname|note` | Delete one owner metadata field | Field allowlist only; cannot delete user data. |
| `.listbans [page]` | List active app-level bans | Pagination; expired bans are not listed as active. |
| `.listenergy [page]` | List energy ledger users | Shows energy/capacity/charging/premium expiry only. |

Mentioning the target or replying to one of their messages is supported. A bare phone number or WhatsApp PN JID can be used. The plugin independently checks `ctx.isOwner`; plugin metadata alone is not trusted.

## Data lifecycle changes

- App database users gain `banUntil`, `banReason`, `bannedBy`, `bannedAt`, `unbannedBy`, and `unbannedAt` only when the owner applies/modifies a ban. This remains compatible with old `banned: true` rows: if `banUntil` is absent/zero, it is treated as a permanent ban.
- The central command gate lazily clears a timed ban when that user runs a command after its expiry. Until then, the expired row can remain in JSON but is not an active ban; `.listbans` uses the active-ban predicate.
- Energy changes use the existing energy ledger mutation lock and atomic writer; the function clamps values to the user's battery capacity and cancels an in-flight charge so the manual adjustment is not overwritten. `energy-worker.js` now uses `WHISKAY_DATA_DIR` when configured, matching the app database and menu/leveling storage; without it, the data path resolves relative to the module/project rather than the shell's current directory. Each change adds one record to `energyAdminHistory`, capped at the 50 newest records.
- `getdata`, `setdata`, and `deldata` are intentionally not generic JSON commands. User-specified property names, file paths, and raw exports are rejected. Only `ownerNickname` and `ownerNote` are exposed for mutation.

## GitHub/source comparison

The Experimental-Bell owner file contains the legacy commands `banned`/`unbanned`, `addenergy`/`kurangenergy`, and `getdata`/`setdata`/`deldata`. Their original implementations reference different user memory APIs (`archiveMemories`), `Data.users`, `Data.audio`, `Data.fquoted`, and bot globals. Whiskay's equivalent app DB and energy ledger have different contracts, so direct copying would be unsafe. This iteration implements a subset with clear current storage support and leaves `setrole`, add/del owner, arbitrary `Data.audio`/`fquoted`, native `block`, session clearing, and raw backup behavior deferred.

## Verification

Run:

```bash
npm run verify:stage38
npm run verify:all
```

Focused tests cover JID parsing, duration bounds, mentioned-target parsing, safe summary output, owner-target rejection, ban/unban persistence, energy ledger adjustments, energy audit trail, metadata allowlist, and non-owner direct invocation. These tests do not prove live WhatsApp operation or API-provider validity.

## Next iteration

Stage 38 Iteration 3: audit co-owner management, native WhatsApp block/unblock and session clearing. These must be based on a verified PN/LID target adapter and session lifecycle safeguards; do not add a generic command that deletes `creds.json`, edits `.env`, or allows secondary owners to remove the primary owner.

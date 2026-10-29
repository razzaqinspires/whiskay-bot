# Stage 38 — Iteration 3: Owner access and session safety

## Source comparison

The upstream reference is [Experimental-Bell `helpers/Events/owner.js`](https://github.com/Rifza123/Experimental-Bell/blob/master/helpers/Events/owner.js), particularly its `addowner`/`delowner`, `addcoowner`/`delcoowner`, `block`/`unblock`, and session-clearing handlers. Those handlers use the upstream global `owner`, `coowner`, `Data`, `Exp`, and session path. They are not drop-in compatible with Whiskay's `PluginManager` and central `security.js`.

## Commands in this iteration

| Command | Behavior | Safety boundary |
|---|---|---|
| `.addowner @target` | Persist a runtime owner grant | Primary `OWNERS` identity only; PN number only; no LID inference |
| `.delowner @target` | Remove a runtime owner grant | Primary owner cannot be removed by command; secondary owners cannot change grants |
| `.listowners` | Display configured primary and runtime owner grants | Does not print secrets |
| `.blockuser @target confirm` | Add target to native WhatsApp blocklist | Primary owner only, explicit confirmation, PN-only, refuses self and owners |
| `.unblockuser @target confirm` | Remove target from native WhatsApp blocklist | Same guards as block |
| `.sessionstatus` | Show session file names, sizes and modification times | Read-only; does not read credential content or delete files |

## Runtime owner persistence

`src/lib/owner-access.js` uses `data/owner-access.json`, or `WHISKAY_DATA_DIR/owner-access.json` when configured. Writes use a temporary file and atomic rename with restrictive permissions. `src/lib/security.js` includes the managed list in `isOwner()` without replacing the primary `.env` owners. The first configured primary owner remains protected from removal. Changes apply to authorization checks in the current process; a multi-process deployment should use a shared transactional store before relying on runtime owner changes across workers.

## Deliberate non-port decisions

- `addcoowner`/`delcoowner` were not added because Whiskay does not currently have a separate co-owner permission matrix. Storing a co-owner label without a well-defined set of privileges would be misleading and unsafe.
- No command deletes session files. The upstream handler's broad session deletion is not copied; Baileys credentials and key-store files are essential authentication state. `.sessionstatus` is inspection-only.
- Native blocklist changes are distinct from app-level bans (`.banned`). Baileys live behavior, WhatsApp server acceptance, and user-visible block behavior need manual verification on a dedicated test account.

## Verification

Run `npm run verify:stage38` and `npm run verify:all`. The isolated test subprocesses require the declared project dependencies; mock sockets do not prove live WhatsApp behavior.

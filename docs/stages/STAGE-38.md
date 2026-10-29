# Stage 38 — Owner parity transplant (Iterations 1–4)

**Scope:** fill owner-command gaps found by comparing Whiskay's existing owner plugins with `helpers/Events/owner.js` in [Rifza123/Experimental-Bell](https://github.com/Rifza123/Experimental-Bell). The source plugin is a reference for feature inventory, not a drop-in module: it uses a different event/runtime contract. The audited upstream file was retrieved through GitHub at [`owner.js`](https://github.com/Rifza123/Experimental-Bell/blob/master/helpers/Events/owner.js).

## Existing Whiskay features retained (not duplicated)

- `.bc` / `.broadcast` with preview, rate-limited gradual delivery and optional registered-user targets.
- `.opsstatus`, `.webhookstats`, `.tunnelhealth`, `.webhookdryrun`.
- `.console` / `.consolef`, `.eval`, `.reload` / `.rl`, `.hotreload` / `.hr`, `.sourcereload` / `.sreload`, `.hrlog`.
- `.testcommands` / `.testcmds`, `.zip` / `.backup`, `.groupbot`, `.setenergy`, `.status`, `.premium`, `.saluran` / `.newsletter`, `.quarantine` and other dedicated controls.

## Added

- `src/plugins/owner/owner-parity.js`
  - `.listgc [halaman]` / `.listgroup [halaman]`: sorted group inventory and paging, without exposing participants' identifiers.
  - `.join <tautan-undangan>` / `.masuk`: validates a WhatsApp invite URL/code before calling Baileys' `groupAcceptInvite`.
  - `.leave confirm` / `.keluar confirm`: requires an explicit confirmation argument and must be run inside the target group; no remote group leave from a private chat.
  - `.listuser [halaman]`: reads only `data/registered-users.json`, filters malformed JIDs and deduplicates entries. It does not scan the address book.
  - `.cekapikey`: reports whether known provider/runtime secret variables are configured, never prints their values, and does not claim live provider validation.
- Focused tests in `test/stage38-owner-parity.test.js`.
- `npm run verify:stage38` and inclusion in `npm run verify:all`.

## Security / architecture

- Requires `ctx.isOwner` again inside the plugin, in addition to plugin metadata `owner: true`.
- Keeps the Whiskay plugin contract and uses the established `ctx.reply`, `ctx.sendInteractive`, and `ctx.sock` adapter.
- Does not alter `.env`, owner authentication, WhatsApp sessions, balances, or role/permission storage.
- API-key output is presence-only. Real credentials must never be committed or included in release archives.

## Verification contract

Run `npm run verify:stage38` and `npm run verify:all`. The unit tests use mocked sockets and do not prove WhatsApp live behavior; validate invite acceptance/group leave on a dedicated test group before production. Baileys API availability and account permissions vary by version/state.

## Iteration 2 — owner data/moderation/economy

Added `src/plugins/owner/owner-management.js` with the bounded commands documented in [`STAGE-38-OWNER-MANAGEMENT-ITERATION-2.md`](STAGE-38-OWNER-MANAGEMENT-ITERATION-2.md): timed/permanent bans, explicit unban, energy add/subtract with audit history, safe database stats/user summary, allowlisted owner nickname/note metadata, active-ban list, and energy-ledger paging. `CommandHandler` now clears expired timed bans on the target's next command; the energy worker honors `WHISKAY_DATA_DIR` consistently with the app database. A ban without a valid positive expiry remains permanent for backward compatibility.

`getdata` does not dump raw JSON, and `setdata`/`deldata` intentionally support only `nickname` and `note`. `setrole`, primary-owner mutation, native WhatsApp block/unblock, session clearing, arbitrary custom response storage, and legacy media/fquoted data manipulation remain deferred until their own persistence, lifecycle, and safety contracts are implemented.

## Next iteration

**Stage 38 · Iteration 4** should complete the parity audit for `offline`/`online`, update checks, and any remaining owner commands that have safe Whiskay equivalents. Do not introduce co-owner privileges until a permission matrix is defined. Then Stage 39 can move to group-admin parity, while RPG command-routing collisions remain a separate regression task. Command routing collisions discovered in RPG remain a separate regression workstream and must not be silently changed inside this owner-management patch.


## Iteration 3 — owner access, native blocklist, and session safety

- Added `src/lib/owner-access.js`, which stores runtime owner grants in `data/owner-access.json` (or `WHISKAY_DATA_DIR/owner-access.json`) with restrictive file permissions and atomic replacement. `src/lib/security.js` includes these grants in the central owner check for the running process.
- Added `src/plugins/owner/owner-access-control.js`: `.addowner`, `.delowner`, `.listowners`, `.blockuser`, `.unblockuser`, and `.sessionstatus`. Only an identity listed in `OWNERS` can modify runtime owner grants or the native WhatsApp blocklist. A secondary runtime owner cannot promote or remove other owners. Primary owners cannot be removed by these commands.
- Native block/unblock requires a separate `confirm` token, accepts only phone-number JIDs, and refuses self or any configured/runtime owner. It changes the WhatsApp account blocklist, not Whiskay's app-level command ban. Live Baileys behavior still requires a dedicated account test.
- `.sessionstatus` reads filenames, sizes and modification times only. There is deliberately no generic session deletion command; Baileys key stores and `creds.json` are authentication state and should not be deleted while the process is active.
- Tests: `test/stage38-owner-access-control.test.js` covers persisted owner grants, primary-only owner mutations, primary-owner protection, explicit native block confirmation, owner/self/LID safety, and session read-only behavior.


## Iteration 4 — offline/online mode

- Added `src/plugins/owner/offline-mode.js` with `.offline <alasan>`, `.online`, and `.offlinestatus`. The setting is stored in `RuntimeState`, so it survives process restarts when the same runtime state file is used.
- `CommandHandler` gates non-owner commands while offline. Owner commands remain available, as do a small allowlist of essential commands (`menu`, `help`, `ping`, registration/status, and offline-mode controls). Replies are rate-limited per sender to reduce spam.
- Offline reason is sanitized and length-limited before it is stored or displayed.
- Remote `.update` was not transplanted: the source implementation has a multi-step download/apply flow and depends on an external update engine. A safe equivalent needs an authoritative release source, archive integrity/signature verification, path traversal protection, and rollback. A read-only `.checkupdate` is deferred until Whiskay's canonical release repository is confirmed.
- Focused tests: `test/stage38-offline-mode.test.js`. See [`STAGE-38-OFFLINE-MODE-ITERATION-4.md`](STAGE-38-OFFLINE-MODE-ITERATION-4.md).

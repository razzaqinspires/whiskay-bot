# Stage 38 — Owner parity transplant (Iteration 1)

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

## Next iteration

**Stage 38 · Iteration 2** should continue with remaining owner-source gaps after command inventory comparison—especially data inspection/mutation and owner/role management—only where Whiskay has a clear persisted data contract and authorization policy. Do not port arbitrary `setdata`, `setrole`, or owner mutation handlers without schema validation, audit logging, and protection against locking out the primary owner.

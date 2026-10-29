# Stage 38 — owner feature parity audit

Reference: [`helpers/Events/owner.js`](https://github.com/Rifza123/Experimental-Bell/blob/master/helpers/Events/owner.js) in the Experimental-Bell repository.

| Source feature / command family | Whiskay status from ZIP audit | Stage 38 decision |
|---|---|---|
| `set` runtime configuration | Split across `.status`, `.setmenu`, `.groupbot`, energy/runtime switches and dedicated controls | Keep modular Whiskay configuration; no legacy `set` mega-handler |
| `backup` | `.zip` / `.backup` exists | Do not duplicate; next audit should verify secret/session exclusions |
| owner console / API-key check | `.console`, `.eval` exist; no equivalent provider-key presence audit found | Add `.cekapikey` without exposing key material |
| group listing / join / leave | `.groupbot` controls bot activation policy; no live group inventory/join/leave commands found | Add `.listgc`, `.join`, explicit `.leave confirm` |
| registered-user listing | Broadcast uses `data/registered-users.json`, but no direct list command found | Add paginated `.listuser` over this existing file only |
| energy grant/reset | `.setenergy reset`, `.charge`, `.statusbaterai`, `.modcoin` and `.premium` exist | Avoid duplicate financial mutation APIs |
| broadcast | `.bc` preview and staged send exists | Keep current implementation |
| command/event inspection | `.testcommands`, menu and plugin registry exist | Avoid duplicate command inventory tooling in this iteration |
| owner/co-owner mutation | No compatible persisted authorization source identified in the inspected plugin list | Defer; do not edit `.env`/live permissions ad hoc |
| arbitrary data get/set/delete | No generic, schema-safe data-store contract identified | Defer until each data domain and audit policy are specified |
| block/unblock, session clearing, role setting | No safe one-to-one implementation proven by initial scan | Further source-to-plugin audit required; don't port blindly |
| newsletter / channel | `.saluran` / `.newsletter` exists | Keep dedicated Whiskay implementation |
| session reset / presence status | No verified safe adapter found during this iteration | Defer to next iteration after inspecting session lifecycle |

## Existing risks noticed during the command-registry scan

A source-level scan found existing command names registered by more than one plugin: `guild` (`rpg-expansion.js` and `rpg-guild.js`), `dungeon` and `adventure` (`rpg-expansion.js` and `rpg.js`), and `buy` (`rpg-buy.js` and `owner/energy-system.js`). The loader currently inserts plugin command mappings into a `Map`, so a later registration can replace an earlier mapping; verify intended routing before altering these names. This is a pre-existing registry issue, not introduced by Stage 38. The dependency-free source import scan also could not import some existing modules because this extracted workspace has no `node_modules`; `node --check` succeeded independently for all checked source files.

This is a bounded audit of the uploaded ZIP and the current GitHub reference revision, not a claim that every behavior of Experimental-Bell has been ported. Some source capabilities intentionally remain deferred until Whiskay's persistence and access-control contracts can support them safely.

# Stage 37 — Experimental-Bell parity transplant (work in progress)

Date: 2026-10-29  
Baseline: Whiskay Bot v2.23.0, Node.js ESM, Baileys 7 RC, plugin-driven command runtime.  
Reference: [Rifza123/Experimental-Bell](https://github.com/Rifza123/Experimental-Bell), `master`; prior audit records the snapshot as 2026-09-05.

## Goal

Perform a command-by-command parity transplant, not a wholesale copy of the legacy event architecture. All source features must be reconciled against Whiskay's plugin registry, command policies, energy/cooldown middleware, serializer, RPG ownership boundaries, and tests.

## Baseline findings carried from Stage 36

- The source inventory identifies 17 `helpers/Events/*.js` modules and nine helper modules.
- The Stage 36 source audit counted 469 literal command-list captures across those 17 event modules. This is a regex-derived scan aid only: dynamically generated commands and aliases may be missed, and a captured command is not necessarily a unique feature.
- Existing Whiskay equivalents are often partial. For example, the presence of downloader plugins does not prove parity with every source provider or alias.
- Werewolf was rebuilt as a Whiskay-native MVP in Stage 36; it is not yet full parity with the source implementation.
- The parity manifest is `docs/stages/STAGE-37-EXPERIMENTAL-BELL-PARITY.json`.

## Transplant policy

1. Keep `src/core/PluginManager.js` and `src/core/CommandHandler.js` authoritative.
2. Adapt source behavior into small Whiskay plugins; do not add a parallel event runtime or duplicate initializer.
3. Route interactive responses through `src/core/serializer.js` and its compatibility adapter.
4. Preserve Whiskay's RPG website as the authoritative source for website-backed Gold/inventory transactions.
5. Apply permission checks to group-admin and owner commands before side effects. Commands that delete data, alter runtime configuration, expose private messages, or execute code are opt-in/excluded until separately reviewed.
6. Add tests for normal flow, invalid input, permission denial, provider timeout, malformed provider response, cooldown/energy behavior, and alias equivalence.
7. Update root `README.md`, `docs/README.md`, the parity manifest, and the test report in the same batch as each feature batch.
8. Never copy `.env`, WhatsApp session files, API keys, or other runtime credentials from either repository.

## Batch order

- **P0 — game, Werewolf parity, owner safety, RPG parity:** preserve existing game commands (including `family100`, `susunkata`, `tebakgambar`, `tebakanime` and all other games found in the source), complete game alias mapping, review owner commands, and compare RPG effects against Whiskay's economy.
- **P1 — AI, converter, downloader, group, maker, relationship, search, tools, miscellaneous:** map every literal and dynamic command, dependency, provider, alias, permission, response mode and fallback.
- **P2 — about/reload/TTS and low-risk utilities:** verify equivalents and add provider-backed TTS only after API/license/config review.

## Verification contract

- `npm run verify:stage37` validates the parity manifest and required documentation links.
- `npm run verify:all` runs Stage 37 after the existing Stage 23–36 suites.
- Unit tests do not prove live WhatsApp delivery, external API availability, or full source parity.

## Current status

**Audit scaffold only; transplant not complete.** This update establishes a machine-checked parity ledger and documentation gates. The command-level implementation status remains incomplete until every source command/alias has a target or an explicit, justified exclusion and tests pass. No feature is represented as transplanted merely because it appears in the manifest.

# Experimental-Bell Feature Gap Ledger — Stage 34

Reference reviewed: `https://github.com/Rifza123/Experimental-Bell/tree/master/helpers` (10 entries at inspection time). Status is scoped to equivalent behavior in Whiskay, not source-file name parity. Source code is not transplanted; concepts are mapped into current contracts.

| Bell helper | Status | Whiskay coverage / gap | Decision |
|---|---|---|---|
| `client.js` | PARTIAL | Global message handler, serializer, group policy, AI trigger, and event bus cover most intake; Bell-specific preference semantics are not all present. | Keep current handler; use adapter for field mapping only. |
| `events.js` | PARTIAL | `EventBus`, plugin registry, and lifecycle events cover event routing; recursive event-file loading/legacy dynamic data contract differs. | Do not duplicate dispatcher; document contract gap. |
| `interactive.js` | PARTIAL | Native-flow sender and `ctx.sendInteractive` cover buttons/list selection; Bell's pending-confirmation/URL-dispatch flows vary by feature. | Reuse Whiskay interactive primitives; port only missing bounded workflows. |
| `utils.js` | PARTIAL | `serializer.js`, `Serializer` compatibility layer, and utility modules cover message normalization, sender mapping, download/reply helpers. | Use `EventShellAdapter`; avoid duplicate utility bundle. |
| `initialize.js` | PARTIAL | Baileys socket lifecycle and interactive helper exist; media preparation/voice waveform features are not fully equivalent. | Feature-by-feature gap only; no full initializer replacement. |
| `reaction.js` | PARTIAL | Some reaction and URL command pathways exist, but reaction-triggered dispatch parity is incomplete. | Add a dedicated reaction event adapter only when a tested user story requires it. |
| `stubTypeMsg.js` | PARTIAL | Group welcome/goodbye and group metadata handlers cover common stub events; every WhatsApp stub type is not mapped. | Maintain explicit supported-stub matrix. |
| `eventGame.js` | PARTIAL | Whiskay has trivia, Tic-Tac-Toe, chess, RPG and game modules; Bell-specific answer matching/session types are not identical. | Compose game session primitives; no cloned game engine. |
| `jadibot.js` | PARTIAL | Whiskay jadibot/pairing portal exists with separate pairing policy; Bell slot management and lifecycle differ. | Retain Whiskay pairing/security flow; audit any gap separately. |
| `Events/` directory | MISSING/PARTIAL | Current plugin/event structure does not claim one-to-one compatibility with all Bell event modules. | Inventory individual files in future stage; do not bulk-import. |

## Adapter contract

`src/core/EventShellAdapter.js` maps common legacy shell fields into the current `ctx`, and can expose a Whiskay context back as a legacy-shaped shell. It intentionally does not load Bell plugins or make them executable without explicit review. Every future adapter extension needs contract tests and must preserve owner/admin authorization in Whiskay's `CommandHandler`.

## Porting gate

1. Confirm license and dependency compatibility before copying code.
2. Compare behavior against Whiskay command registry, not just names.
3. If current components cover roughly 80% of the requirement, compose them and mark PARTIAL.
4. Only implement a new module for a concrete uncovered behavior with tests, permissions, observability, and rollback.

# Stage 38 · Iteration 4 — Offline / Online Mode

## Scope

Adapted the Experimental-Bell `.offline` / `.online` owner feature to Whiskay's plugin architecture. This iteration adds maintenance mode only; it does not transplant the legacy remote updater.

## Commands

- `.offline [alasan]` — enable maintenance mode and persist the reason/time.
- `.online` — disable maintenance mode.
- `.offlinestatus` — show the current mode.

## Behavior and guardrails

- State is stored under the existing `RuntimeState` key `offlineMode`.
- While enabled, non-owner commands are blocked before normal command execution. Owner commands continue to work so maintenance can be reversed.
- Essential commands remain allowed: offline controls, menu/help, ping/start, owner information, and registration/status commands.
- A per-sender in-process notice cooldown (30 minutes) prevents repeated offline notices from flooding chats. This cooldown resets when the process restarts.
- Reasons are sanitized and limited to 240 characters.
- Tests exercise status normalization, disabled state, owner bypass, allowlisted commands, and status rendering.

## Update parity decision

Experimental-Bell's `.update` command is not a simple command: it downloads and applies a cumulative multi-file update and stores pending confirmation state. Whiskay does not yet define a canonical signed release source or verified rollback flow. Automatically downloading and replacing code without these controls would be unsafe. Remote `.update` and `.checkupdate` therefore remain deferred rather than being represented as implemented.

## Verification

Run `npm run verify:stage38` and `npm run verify:all`. These are local automated tests and do not replace a staged runtime test. Confirm the owner identity, offline command gating, restart persistence, and `.online` recovery on a non-production test instance before deploying.

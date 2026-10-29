# Stage 39 — Group Administration Parity, Iteration 1

## Audit

The Experimental-Bell `helpers/Events/group.js` contains settings, invite, moderation, mention, temporary-message, schedule, group info, and welcome/leave workflows. Whiskay already had group metadata, admins, tagall/hidetag, invite revoke, subject/description, open/close, anti-link, anti-spam, welcome text, kick/add/promote/demote, anti-toxic, anti-ban-word, and text guard. This iteration adds only missing functionality that can be safely integrated without copying Experimental-Bell's event/runtime API.

## Changes

- `.bancmd <command[, command...]>`, `.unbancmd <command[, command...]>`, `.bancmd --list`: persisted per-group command blocks via `group-settings.json`.
- Protected recovery commands include `bancmd`, `unbancmd`, `grouphelp`, `groupstatus`, `groupinfo`, `menu`, `help`, `ping`, `owner`, and `admins`. Group admins and bot owner bypass blocked command entries; non-admin members receive a short refusal.
- `.ephemeral off|24h|7d|90d|status`: calls `sock.groupToggleEphemeral(groupJid, seconds)` only when that API exists and accepts only listed durations.
- Test coverage for persistence/normalization, protected commands, duration mapping, and missing API fallback.

## Deferred after audit

- Scheduled open/close: requires a durable scheduler, cancellation/status command, restart recovery, and timezone tests.
- Welcome/leave media templates: needs media validation, safe placeholder rendering, and integration with the actual participant update handler.
- `totag` forwarding: requires correct message-key lookup and quote/media handling.
- Invite-info lookup and group picture updates: require additional permission, remote-data, media, and privacy validation.

## Validation boundaries

Unit tests use a mocked Baileys socket. They do not prove that an actual WhatsApp group permits a requested operation. The operator must use a compatible Baileys version and make the bot an admin where WhatsApp requires it.

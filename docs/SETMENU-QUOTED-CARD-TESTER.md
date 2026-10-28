# Setmenu, Quoted Messages, Card V2, and Owner Command Tester

## Interactive setmenu

`.setmenu order` opens the list picker. `.setmenu symbols count` toggles sequential numbering for informational widgets; the existing before/after symbols remain independently configurable. Supported values are `category`, `az`, and `za`; the command count is recalculated after filters are applied.

Two themes are available: `neon` and `zen`. Five operational widgets are available:

- `biocore`: runtime and registered plugin count (a status label, not a claim of sentience).
- `events`: accumulated command-hit counter exposed by the existing hit service.
- `messages`: sum of locally recorded `messageCount` fields in `data/app-database.json`.
- `uptime`: current Node.js process uptime.
- `database`: local user count and `updatedAt` timestamp.

## Command line audit

Owner command: `.testcommands` (alias `.testcmds`). It inventories registered plugin commands, syntax-checks JavaScript/CJS/MJS under `src/`, and runs `node --test`. The WhatsApp result contains Save & Update README and Don't Save buttons.

Saving creates `test/owner-command-audit-<id>.test.js` and adds a report summary to `README.md`. Temporary raw reports live in `data/test-reports/`. The audit intentionally does not invoke every business command: commands may send messages, alter user data, buy/sell items, or call external services. Those need isolated mocks or explicit integration-test fixtures.

## Quoted messages and fake quote previews

The standard Baileys form is:

```js
await sock.sendMessage(jid, { text: 'hello world' }, { quoted: message });
```

`message` should be a real `WAMessage` (for example, from `messages.upsert` or a message store), not only a `key` object. In this project, `serializer-compat.cjs` normalizes quoted message keys and exposes `m.freply`, `m.replyFake`, `m.getFake`, and `sock.sendFakeReply`; `lib/freply.cjs` supplies synthetic message types.

`.setmenu quote` offers standard quote, no quote, bot preview, and experimental synthetic preview styles (text, contact, image, product, newsletter, interactive, event). Experimental styles are labelled as synthetic bot previews and do not select a fabricated third-party or verified persona. Some clients may render these layouts differently, and WhatsApp/Baileys changes may invalidate undocumented visual tricks.

Useful references:
- Baileys sending messages documentation: https://github.com/WhiskeySockets/docs/blob/main/messaging/sending-messages.mdx
- Baileys README (quoted message example): https://github.com/WhiskeySockets/Baileys/blob/master/README.md
- Issue #1467, quoting syntax and `quoted` options: https://github.com/WhiskeySockets/Baileys/issues/1467
- Issue #1493, cross-client media quote rendering caveat: https://github.com/WhiskeySockets/Baileys/issues/1493

## Menu Card V2

The fallback card renderer uses a 1200×675 landscape canvas (16:9). The interactive sender passes the rendered PNG/URL through `options.image`; media upload depends on a connected Baileys socket and working upload support. If media upload fails, the menu text remains available as a fallback.

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

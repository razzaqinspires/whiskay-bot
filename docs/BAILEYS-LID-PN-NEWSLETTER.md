# Baileys 7 LID/PN Owner Resolution and WhatsApp Channels

Date: 2026-10-26

## Problem

The `.jadibot` permission check relies on `ctx.isOwner`, but the ESM serializer facade did not export the `serializeMessage` adapter imported by message handlers. The compatibility serializer also only used `remoteJidAlt` and `participantAlt` in a subset of mappings, and owner identity comparison based only on digits could incorrectly equate a LID with a phone-number JID.

## Changes

- Added `serializeMessage(sock, raw, config, bot)` to the existing ESM serializer facade.
- Read `remoteJidPn`, `remoteJidAlt`, `participantPn`, and `participantAlt` when resolving PN identity.
- Preserved group (`@g.us`), broadcast (`@broadcast`), and channel (`@newsletter`) JIDs rather than rewriting them as phone JIDs.
- Set `ctx.isOwner` by exact canonical JID comparison across PN and LID namespaces.
- Updated imports to the actual lowercase `serializer.js` filename for Linux case sensitivity.
- Added owner-only `.saluran` / `.newsletter` commands for create, info, send text, rename, description, follow, and unfollow, gated by method availability in the installed Baileys socket.
- Updated README and added focused tests.

## Commands

```text
.saluran
.saluran buat Nama Saluran | Deskripsi
.saluran info <id@newsletter atau tautan undangan>
.saluran kirim <id@newsletter> | Pesan teks
.saluran nama <id@newsletter> | Nama baru
.saluran deskripsi <id@newsletter> | Deskripsi baru
.saluran follow <id@newsletter>
.saluran unfollow <id@newsletter>
```

Use only channels the owner controls. Channel creation and posting may be limited by account eligibility and Baileys version. Verify the channel in the official WhatsApp client after each operation. Do not assume that `sendMessage()` returning an ID means that the post is publicly visible.

## Tests run

- `node --check` for changed JavaScript files.
- `node --test test/lid-owner-newsletter.test.js` (requires project dependencies only for imports reachable from the test; if dependency installation is unavailable, report that separately).
- Full `npm test` attempted when dependencies are installed.

## Upstream references

- Baileys v7 migration: https://github.com/WhiskeySockets/docs/blob/main/migration/v7.mdx
- Baileys repository: https://github.com/WhiskeySockets/Baileys
- Newsletter send instability report: https://github.com/WhiskeySockets/Baileys/issues/2687
- Baileys newsletter socket API declarations: https://app.unpkg.com/@whiskeysockets/baileys@7.0.0-rc.2/files/lib/Socket/newsletter.d.ts

## Limitations

Baileys exposes LID-to-PN mapping only when the mapping is known/cached. Never fabricate a phone number from a LID. Some versions expose `remoteJidAlt` / `participantAlt` without the `*Pn` aliases, so the adapter checks both. Live WhatsApp pairing and newsletter creation/posting have not been verified by this local test suite.

# Baileys interactive compatibility notes

## What the upstream documentation says

The upstream README documents sending messages through `sock.sendMessage(jid, content, options)` and quoting a message using `{ quoted: message }`. See https://github.com/WhiskeySockets/Baileys/blob/master/README.md.

## Relevant issue reports checked on 2026-10-26

- [#2465 — List Messages in latest versions](https://github.com/WhiskeySockets/Baileys/issues/2465), opened 2026-04-04: reporter says calls can succeed without a visible interactive list.
- [#2877 — Maintenance status question](https://github.com/WhiskeySockets/Baileys/issues/2877), opened 2026-10-25: community question; not itself a maintainer announcement.
- [#2850 — Bulk messaging and bans](https://github.com/WhiskeySockets/Baileys/issues/2850), opened 2026-10-07: user report about restrictions after bulk sends.

Issue reports can be incomplete and version-specific. This project does not treat them as guaranteed reproduction steps.

## WHISKAY implementation choices

- The serializer recognizes native-flow `paramsJson`, common row/button ID aliases, and preserves the parsed data on `selectedButtonData`.
- List sections are kept small (up to eight rows each).
- Calculator functionality is also accessible through a direct text command: `.telur hitung 10000 1700`.
- `sendInteractive` fallback text remains important because WhatsApp client/platform support may vary.
- Quote mode `bot-preview` uses a clearly labelled bot-authored preview, never a fake identity of another user.

## Validation boundary

Static checks and unit tests cannot prove that Android, iOS, and WhatsApp Web will render the same interactive message. Always test a low-volume message with a controlled account before enabling a feature broadly.

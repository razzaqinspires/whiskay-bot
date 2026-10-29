# Stage 39 — Group Administration Parity, Iteration 3

Date: 2026-10-29
Version: 2.25.2

## Added

- `.totag` replies to a quoted text or supported media and sends it to the group while mentioning current participants visibly. `.tohidetag` attaches the same mention list without printing each `@` handle in the message body. Supported media are bounded to 15 MB.
- `.inviteinfo <link>` validates that the input is a WhatsApp group invite URL before calling `groupGetInviteInfo`. Unsupported API methods and invalid/expired links fail safely.
- `.setppgc` updates the group profile picture from a replied JPEG/PNG/WebP image, with 5 MB size cap and explicit API availability check. Requires admin authorization and bot-admin rights.
- Group command help, README, changelog, and mocked socket tests updated.

## Safety and limits

- Invite lookup only accepts `chat.whatsapp.com` invite URLs; it does not join the group or change membership.
- Media relaying downloads the quoted media through the existing serializer helper and refuses empty/oversized buffers. Sticker forwarding also sends a separate mention notice because stickers do not support captions.
- Profile-picture changes use `updateProfilePicture` only if the socket exposes it. A mocked method passing tests does not prove that a particular Baileys release or live group accepts the operation.
- `.totag` may create a large mention message in very large groups; member JIDs are sourced from current group metadata.

## Verification

Run `npm ci`, then `npm run verify:stage39` and `npm run verify:all`. Tests use mock sockets; verify invite lookup and profile-picture update against a controlled WhatsApp test group before production use.

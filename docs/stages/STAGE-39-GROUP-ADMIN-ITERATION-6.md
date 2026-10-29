# Stage 39 — Iteration 6: Group parity audit, blacklist and profile tools

## Added
- `.blacklist @member` and `.unblacklist @member`: persist a group-specific JID list in `data/group-settings.json` through the validated group settings API. The command is admin-gated, caps the list at 500, excludes the caller and group admins, and checks configured bot owners before adding a target.
- Group message intake checks the blacklist before normal command/AI handling. Messages from blacklisted non-admin/non-owner members are suppressed; if the bot can delete the message, deletion is attempted. This is not a kick/ban and does not remove members from the group.
- `.getpp` for the caller, a mentioned user or a replied-to user; `.getppgc` for the group profile image. API absence and privacy/lookup failures are reported without claiming success.
- `.infogc` and `.infogroup` aliases for `.groupinfo`.

## Source parity audit
The source `helpers/Events/group.js` includes multiple unrelated families. Whiskay has counterparts or adaptations for group settings, member moderation, tag/hidetag, invite info, welcome/leave, schedules, attendance, ephemeral settings, command blocks, and pin/profile tools. Some source features remain deferred or intentionally not transplanted as part of group admin iteration: subscription/sewa administration (`listsewa`, `addsewa`, `kurangisewa`, `delsewa`, `ceksewa`), energy rankings, prayer schedule, WhatsApp status posting, AFK, and exact legacy event-framework behavior. These require separate owners/data/provider contracts or have unrelated dependencies; no parity claim is made for them.

## Safety / limitations
- Blacklist is a per-group message moderation list, not a WhatsApp native block or group removal.
- Message deletion depends on bot admin privileges and transport support.
- Profile image URLs may not be available due to WhatsApp privacy settings or installed Baileys API behavior.
- Live WhatsApp behavior was not exercised; tests use mocked sockets.

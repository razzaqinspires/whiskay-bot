# Group tools and moderation

## Commands

| Command | Purpose | Permission |
|---|---|---|
| `.grouphelp` | Help for group tools | Group member |
| `.groupinfo` | Subject, member/admin counts, created date, and guard settings | Group member |
| `.admins` | Mention administrators | Group member |
| `.tagall [message]` | Mention all participants | Group admin or bot owner |
| `.hidetag [message]` | Send announcement with hidden mentions | Group admin or bot owner |
| `.kick`, `.add`, `.promote`, `.demote` | Participant moderation | Group admin/owner and bot admin |
| `.linkgroup` | Read invite URL | Group admin/owner and bot admin |
| `.revoke` | Revoke the old invite code | Group admin/owner and bot admin |
| `.setsubject <text>` / `.setdesc <text>` | Update group title/description | Group admin/owner and bot admin |
| `.closegroup` / `.opengroup` | Admin-only posting / all-member posting | Group admin/owner and bot admin |
| `.antilink on|off|status` | Per-group link filter | Group admin/owner |
| `.antispam on|off|status` | Per-group message burst filter | Group admin/owner |
| `.welcome on|off|status` | Welcome/leave notices | Group admin/owner |
| `.setwelcometext <text>` | Configure welcome template | Group admin/owner |

## Runtime behavior

- Group settings live in `data/group-settings.json`; the data directory is ignored by Git and should be backed up if you want to preserve configuration.
- `antilink` detects common HTTP, WhatsApp invite, Telegram and Discord links from non-admin members. If the bot is a group admin, it attempts to delete the violating message and warns the sender. If the bot is not admin, it can only warn.
- `antispam` flags more than six messages from the same non-admin sender within a rolling 10-second window. The counter is in memory and resets after process restart; it is not a distributed anti-spam service.
- `welcome` responds to Baileys `group-participants.update` add/remove events. Placeholders `{user}` and `{group}` are supported. Custom text is limited to 500 characters.
- Admin rights are resolved from `groupMetadata` rather than trusting flags on the incoming message. For sensitive actions, the bot must be a group admin.
- The guard is best-effort: metadata/API failures skip enforcement rather than block all group messages. Review logs and test with a secondary group before enabling filters broadly.

## Tests

`test/group-features.test.js` covers safe defaults, persistence, invalid group IDs, anti-link deletion for non-admins, admin exemption, welcome placeholders, and command registration. These are local unit tests; they do not replace a live WhatsApp group integration test.

# Stage 49 — Part 2: Group Collaboration & Consent-Based Invitations

**Release:** Whiskay Bot v2.35.4  
**Scope:** Owner-controlled group previews and opt-in invitation links.

## Changes

- Added owner-only `.copymember <GROUP_ID>` and `.copyptpt <GROUP_ID>` as cached source-group previews. They report the cached group name, participant count, and admin count.
- These commands deliberately do not export participant lists, harvest phone numbers, or add members to another group. A group membership list is not blanket consent to contact or add each participant elsewhere.
- Added owner-only `.groupinvite <GROUP_ID_TUJUAN>`. It creates a WhatsApp invite link for a cached destination group using `groupInviteCode`.
- `.groupinvite` is restricted to private chat to reduce accidental disclosure of invite links in public group conversations.
- The destination group must exist in the local metadata cache. No repeated metadata fetch is performed by this command.
- Existing `.joingc`, `.listgc`, detail, and paginated member views remain available.

## Usage

```text
.copymember <GROUP_ID_SUMBER>
.copyptpt <GROUP_ID_SUMBER>
.groupinvite <GROUP_ID_TUJUAN>
```

Run `.groupinvite` in a private chat with the bot. Share the generated link only with people who explicitly asked to join. WhatsApp group admins retain control over admission and link revocation.

## Security properties

- Owner authorization is checked before command execution.
- Group IDs are validated as WhatsApp group JIDs.
- Group metadata is read from `data/group-metadata.json` cache.
- Invite code format is validated before constructing the URL.
- No bulk participant-add operation, contact scraping, unsolicited invitation, or anti-abuse evasion is implemented.

## Verification

`npm run verify:stage49-part2`

Three tests cover cached preview behavior, owner/private-chat restrictions, invite link generation, and malformed/non-owner requests. These tests use a mocked Baileys socket; they do not claim a live WhatsApp invite was created.

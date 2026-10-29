# Stage 39 — Iteration 5: Group Settings Alias Parity

## Added

- `.open` / `.close`: aliases for allowing all members to send messages or restricting messages to admins.
- `.locked` / `.unlocked`: lock or unlock group metadata editing using Baileys `groupSettingUpdate`.
- `.linkgc`: returns the current WhatsApp group invite link when `groupInviteCode` is available.
- `.resetlink`: alias for revoking the current invite link and returning the new link.
- `.setname` / `.setdescription`: aliases for existing group subject and description handlers.
- `.group <action>`: grouped entry point for `open`, `close`, `link`, `resetlink`, `locked`, `unlocked`, `setname`, and `setdesc`.

## Safety and compatibility

- Existing admin and bot-admin checks are reused for aliases after command normalization.
- Socket methods are checked before use for invite-code, revoke-invite, and group-setting operations; API errors are reported without claiming success.
- `.group` rejects unknown actions with usage help.
- These tests use a mocked socket. Validate the installed Baileys API and permissions in a test group before production use.

## Verification

- Stage 39 tests: 17/17 passed in this iteration's test environment.
- Full `verify:all`: run recorded in the accompanying Iteration 5 test report.

# Stage 39 — Group Administration Parity, Iteration 2

## Changes

- Added persisted `.groupschedule close HH:MM`, `.groupschedule open HH:MM`, `.groupschedule list|status`, and `.groupschedule off` per-group controls. Times are interpreted in `Asia/Jakarta` (WIB).
- Added `src/lib/group-scheduler.js` and registered `group-schedule-check` in Chronos. It checks every 30 seconds, applies `announcement` or `not_announcement`, persists separate last-close and last-open dates, and isolates errors per group.
- Added `.setleavetext <text>` alongside `.setwelcometext <text>`. Both use `{user}` and `{group}` placeholders and flow through the existing `group-participants.update` listener.
- Group schedule persistence is stored in `data/group-settings.json` (or `WHISKAY_GROUP_SETTINGS_FILE`) and validated as 24-hour `HH:MM` values.

## Usage

- `.groupschedule close 22:00`
- `.groupschedule open 07:00`
- `.groupschedule list`
- `.groupschedule off`
- `.setwelcometext Selamat datang {user} di {group}!`
- `.setleavetext {user} telah meninggalkan {group}.`

The bot must be online at the scheduled minute and have the required admin permissions. Schedules missed while offline or while the scheduler is unavailable are not replayed automatically. Close and open each execute at most once per WIB date. Schedule commands require a group admin or bot owner, and the bot must be a group admin for schedule changes.

## Validation

`test/stage39-group-scheduler.test.js` checks valid/invalid schedule values, close/open execution and per-action daily idempotency, and graceful handling when the socket API is unavailable. `test/stage39-group-admin-parity.test.js` retains Iteration 1 coverage.

Tests use mocked sockets and do not prove behavior against a live WhatsApp group. Live validation must confirm that the installed Baileys version accepts the calls and the bot has administrator privileges.

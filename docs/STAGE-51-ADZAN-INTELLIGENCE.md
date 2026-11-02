# Stage 51 Part 7 — Advanced Adzan Intelligence

Release: Whiskay Bot 2.35.11

## User commands

| Command | Behavior |
|---|---|
| `.adzan berikutnya` | Next prayer and countdown, with personal corrections applied |
| `.adzan kiblat` | Initial geodesic bearing to the Kaaba, clockwise from true north |
| `.adzan hijriah` | Tabular-civil Hijri estimate for the user's local date |
| `.adzan mingguan` | Seven-day schedule summary |
| `.adzan bulanan` | Rolling 30-day schedule summary |
| `.adzan ics` | Sends an iCalendar attachment for the current local date |
| `.adzan pengingat 0..30` | Text pre-alert lead time in minutes; zero disables it |

All these personal commands are restricted to private chat. They use the effective personal profile and IANA timezone. Users still need `.adzan on` for scheduled notifications. Pre-alerts are text-only and are persisted in the existing delivery outbox under a separate `pre-<prayer>` event key, so they do not collide with the main prayer notification.

## Calculation caveats

- Qibla is a geographic initial bearing from true north, not a live magnetic compass heading. A device compass should be calibrated; magnetic declination varies by location and date.
- Hijri output uses the engine's tabular-civil arithmetic calendar. It is an estimate and does not determine official rukyat, local moon-sighting, or government dates.
- Prayer times are astronomical estimates. Method presets and personal minute corrections should be compared against a trusted local mosque or authority timetable.
- `.adzan bulanan` means a rolling 30-day window, not a Hijri or Gregorian calendar month.
- `.adzan ics` exports one day per invocation. Import the `.ics` file into the user's calendar application.

## Pre-alert delivery

`preAlertMinutes` is stored per user, validated as an integer from 0 through 30, and exposed to the opted-in subscriber scheduler. The scheduler queues the pre-alert when its lead-time timestamp falls within the normal grace window. It is text-only. Delivery inherits the existing durable outbox retry behavior. The actual prayer event remains a separate event and may send audio according to the user's audio preference.

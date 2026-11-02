# Stage 51 Part 8 — Smart Adzan Automation

Release: Whiskay Bot 2.35.12 · 2026-11-01

## Purpose

Add optional, per-user Friday/Jumu'ah and Ramadan reminders without changing the existing five-prayer schedule, audio preferences, or manual group reminder compatibility. These reminders are text-only and are delivered to the subscribed user's private WhatsApp chat.

## Commands (private chat)

| Command | Behavior |
|---|---|
| `.adzan automasi` | Show personal automation settings and quick-reply controls |
| `.adzan jumat on` / `.adzan jumat off` | Enable/disable the Friday reminder |
| `.adzan jumat HH:mm` | Set the local Friday reminder time and enable it |
| `.adzan ramadan on` / `.adzan ramadan off` | Enable/disable Ramadan-only Sahur and Iftar reminders |
| `.adzan sahur 0..120` | Set minutes before Fajr; `0` disables Sahur reminders |
| `.adzan iftar on` / `.adzan iftar off` | Enable/disable the Iftar reminder |
| `.adzan iftar 0..60` | Set minutes before Maghrib; `0` means at Maghrib and enables the reminder |

All automation is opt-in and requires `.adzan on`. The worker runs through the existing 15-second `reminder-delivery` job. The bot recalculates from the latest profile each run. A newly shared static location or changed timezone invalidates pending queued reminders for that user; the next scheduler cycle calculates using the new region. It does not silently read device GPS or track live location.

## Scheduling rules

- Friday reminders are scheduled on the local Gregorian Friday at the user's configured `HH:mm`, default `11:00` when enabled.
- Ramadan is detected using the vendored engine's `gregorianToHijri()` tabular-civil estimate (`month === 9`). This is a software estimate, not a rukyat announcement or authoritative Ramadan declaration.
- Sahur is scheduled `sahurReminderMinutes` before the day's calculated Fajr.
- Iftar is scheduled at Maghrib, or `iftarReminderMinutes` before Maghrib.
- All wall-clock conversion uses the user's IANA timezone. Nonexistent wall-clock times during a daylight-saving transition are rejected rather than silently shifted.
- Messages use a separate event key per user/date/reminder type and the existing persistent outbox retry mechanism. Friday, Sahur and Iftar messages are text-only; main prayer audio preferences are unchanged.
- The existing 10-minute grace window applies. Very late events outside that window are skipped, not delivered hours late.

## Profile refresh / stale queue behavior

Location, timezone and personal automation setting changes cancel queued-but-not-yet-sent Adzan events for that user. Turning `.adzan off` also cancels pending queued notifications. The scheduler continuously reads current profiles and recomputes local schedules. An event already in the `sending` state cannot be recalled while Baileys is executing a send request.

## Limitations

- IANA timezone must be set correctly by the user; GPS coordinates do not reliably identify a timezone in this engine.
- Hijri/Ramadan detection is tabular-civil and can differ from local moon-sighting decisions by a day. Follow official local announcements and local imsakiyah schedules.
- Prayer times remain astronomical estimates and should be checked against a trusted local authority or mosque.
- Live WhatsApp delivery, provider outages, and real-device behavior must be validated on the bot owner's host. Unit/integration tests use a mock Baileys socket.

## Reliability / privacy

- Subscribers must opt in through `.adzan on`.
- Automation commands are private-chat-only; user location details are not echoed to groups.
- A reminder is persisted before WhatsApp send and uses the existing bounded retry outbox. Delivery remains at-least-once across the narrow crash boundary after provider acceptance but before local success persistence.
- Profile edits cancel queued stale events and the scheduler refreshes from the current profile every 15 seconds.

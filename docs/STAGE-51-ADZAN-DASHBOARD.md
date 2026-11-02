# Stage 51 — Part 6: Adzan Dashboard & User Experience

## Scope

Part 6 adds per-user calculation preferences, minute corrections, local audio packs, an interactive status dashboard, and per-user delivery history. Settings are isolated by WhatsApp sender ID and stored in `data/adzan-profiles.json` through the existing atomic profile store.

## Commands

- `.adzan status` — interactive personal dashboard.
- `.adzan jadwal` — today's schedule with active method and location.
- `.adzan metode indonesia|mwl|egyptian` — choose calculation preset.
- `.adzan koreksi subuh|zuhur|asar|magrib|isya -30..30` — apply an integer minute offset.
- `.adzan audio pack default|custom` — choose local audio pack.
- `.adzan audio on|off|status` — personal audio preference.
- `.adzan riwayat` — show the latest ten personal delivery records.

## Audio files

Default pack:

- `media/adzan/subuh.mp3`
- `media/adzan/umum.mp3`

Custom pack:

- `media/adzan/custom-subuh.mp3`
- `media/adzan/custom-umum.mp3`

A missing/invalid custom audio file results in the existing text fallback; the bot does not fetch audio from remote URLs. Audio remains subject to the existing 20 MB validation limit.

## Calculation notes

The supported presets are the engine's `indonesia-kemenag-reference`, `mwl`, and `egyptian`. The preset name does not certify the result as an official government schedule. Minute corrections are per-user offsets applied to each event's timestamp and displayed time, bounded to -30..+30 minutes. Verify local settings against the relevant authority or mosque.

## Privacy

The dashboard and delivery history are personal DM features. Location coordinates remain hidden in group contexts. The history query filters by the requesting user's WhatsApp ID.

## Verification

Run `npm run verify:stage51-adzan-dashboard`. The test suite covers method selection, correction application and bounds, audio path selection, per-user history isolation, and dashboard controls.

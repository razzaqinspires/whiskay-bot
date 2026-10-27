# WHISKAY Bot v2.5.5 — Menu, Egg Calculator & Serializer Compatibility

Date: 2026-10-26

## Changes

1. Added a transaction preset single-select list and manual calculation command to the egg calculator.
2. Added `calculateEggTransaction()` with positive-integer validation and upper bounds.
3. Added `renderEggResultCardV2()` with optional canvas/FFmpeg rendering. If rendering is unavailable, the textual result still sends.
4. Added six themes (`ocean`, `sunset`, `emerald`, `sakura`, `monochrome`, `royal`) and a confirmation stage before a theme or random preset replaces presentation settings.
5. Grouped `.setmenu` options by clear categories and limited list sections to eight rows per section.
6. Added widget prefix/suffix symbols and quote modes (`default`, `bot-preview`, `none`).
7. `bot-preview` quote injection uses a bot-authored, explicitly labelled preview; it does not impersonate an external user.
8. Extended serializer interaction metadata: `responseType`, `selectedButtonData`, and multiple native-flow selected-ID aliases.
9. Menu Canvas v2 accepts a circular avatar overlay when the user's manual profile image is available.
10. Updated `README.md`, `.env.example`, package versions, tests and documentation index.

## Commands

- `.telur` — open preset list
- `.telur manual` — show manual input instructions
- `.telur hitung 10000 1700` — calculate five eggs, Rp8.500 total and Rp1.500 change
- `.setmenu` — open categorized settings
- `.setmenu template ocean` — asks for confirmation
- `.setmenu template confirm ocean` — applies the theme and resets presentation settings
- `.setmenu template random` — asks for confirmation before randomizing
- `.setmenu template confirm random` — randomizes template/font/widgets/layout/symbols
- `.setmenu symbols` — symbol presets
- `.setmenu symbols before ✦` / `.setmenu symbols after ✓` — custom widget symbols
- `.setmenu quote` — quote behavior picker

## Configuration

`EGG_CALCULATOR_URL` points to the optional HTTPS calculator site. The website is a separate deployment; this ZIP updates bot-side integration only and does not include the website's source.

## Baileys documentation and issue review

- Upstream README: https://github.com/WhiskeySockets/Baileys/blob/master/README.md
- Issue #2465 (opened 2026-04-04): reports list messages that may not be delivered or rendered as interactive lists on latest versions: https://github.com/WhiskeySockets/Baileys/issues/2465
- Issue #2877 (opened 2026-10-25): asks whether Baileys maintenance is changing: https://github.com/WhiskeySockets/Baileys/issues/2877
- Issue #2850 (opened 2026-10-07): reports bans/restrictions after bulk messaging: https://github.com/WhiskeySockets/Baileys/issues/2850

Implications: native-flow/list messages are treated as best-effort UI, not as the only way to access functionality. Keep fallback text and avoid bulk unsolicited messaging. These are issue reports, not proof that every installation is affected.

## Test record

Added unit tests cover:
- integer and positive amount validation;
- rounding down to whole eggs;
- change and shortfall;
- the calculator's list and manual-input buttons;
- confirmation before theme replacement;
- categorized menu sections;
- symbol/quote configuration and bot-preview labeling.

Syntax checks are run separately. Live WhatsApp delivery, cross-platform button rendering, and live Canvas output are not claimed unless separately tested on a real connected account.

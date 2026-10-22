# WhiskayBot Menu Update

## Per-user menu
- `.menu`: alphabetical command menu with line numbers and a 7-day `🆕` marker for newly detected canonical commands.
- `.setmenu`: interactive settings; options are stored per sender in `data/menu-settings.json`.
- `.setmenu template corporate|minimal|terminal|elegant`
- `.setmenu description on|off`
- `.setmenu order az|za`
- `.setmenu font normal|bold|sans|mono`
- `.setmenu mode buttons|text`
- `.setmenu widget category|count|prefix|new|owner|footer on|off`
- `.setmenu reset`

New-command history is stored in `data/menu-command-ledger.json`; the badge expires by timestamp after seven days. Aliases are not listed independently. Plugins can specify `menuCommands` to declare which commands have distinct purposes; otherwise only the first command is shown. The website plugin explicitly lists each distinct website action, while `hrlog`, `watchlog`, and `changelog` share one visible menu entry.

## Website
- `.webview` is an alias of `.webstatus`.
- `.webstatus` tries a rich-response builder if the serializer provides one; otherwise it uses `sendInteractive` with refresh and website actions.
- `.webproduct` without arguments attempts `GET /api/v1/content` and displays products returned by `products[]` (or common nested catalogue shapes). Product records should include `name`, optional `description`, `price`, `image`/`imageUrl`, and optional `url`/`sku`.
- `.webproduct {JSON}` still submits `product.update` events.

## Compatibility notes
The package remains on `@whiskeysockets/baileys` `7.0.0-rc14`. The serializer facade now includes the matching `helpers.cjs` and `freply.cjs` modules restored from the project's prior serializer source and adapted to `@whiskeysockets/baileys`. The product command uses `buttonBuilder().toCard()` plus `carouselBuilder()` when available, with image-card fallback if native carousel sending fails. The live status command uses `AIRich` when available and `sendInteractive` as fallback. Validate cards on a second WhatsApp client before production rollout because rendering can vary by WhatsApp client/version.


## Menu Pro v2.2.1 refinement
- Font selection is now a second-stage numbered picker with descriptions and Unicode previews.
- The selected font is applied to the menu heading, subtitle, counts, prefix line, category headers, command numbering/labels, footer and closing border where the font supports the characters.
- Added per-user `linePrefix` setting (`.setmenu line on|off`).
- Removed duplicate category-sort row and renamed it `Urut kategori lalu A–Z`.
- Menu has one activity-based `quick_reply` recommendation with a percentage, one `cta_url` button to the official site, and one `single_select` settings list.
- Command usage is counted per sender in `data/menu-command-usage.json`; the percentage is the command's share of the user's recorded command usage.
- Added font choices with numbered previews: normal, superscript, double-struck, small caps, fraktur, bold italic, bold serif, sans bold, monospace, zalgo and sans-bold alternative. Some Unicode fonts have incomplete character coverage depending on the device.
- `CommandHandler` records successful command usage after execution; menu and setmenu are excluded from recommendation history.
- Version: 2.2.1.

## v2.3.0 — Menu controls and engagement engine
- Widget picker is a dedicated interactive single-select screen with individual toggles and all-on/all-off controls. Menu UI uses native interactive buttons rather than plain-text fallback instructions.
- Added separate controls for the top border (`┏━━━━━━━━`), bottom border (`┗━━━━━━━━━━━━`), number-line prefix, and line spacing (0–3). Selecting a template resets custom line-prefix/border/spacing values to template defaults.
- Added per-user manual menu image selection, official menu image URL via `MENU_IMAGE_URL`, and image saving by replying to a photo with `.setmenu image save`.
- Added group-level XP leveling (`.leveling on|off|status`), profile/progress/economy/familiarity/premium cards (`.profile`), opt-in/out level-up notification (`.levelnotify on|off`), rank matrix (`.rankmatrix`), and owner-only worker console (`.worker`).
- XP is awarded only in groups where leveling is enabled. Manual familiarity changes require a consent argument and are written to an audit log. Worker monitor intentionally records event metadata, not conversation content.
- Profile cards are currently structured interactive text cards with progress bars. A separate image renderer/canvas dependency is not included in this release, so true generated PNG cards need a later renderer integration.


## v2.3.3 — perbaikan alur gambar menu
- Memperbaiki ekstraksi quoted message agar contextInfo dibaca dari berbagai tipe pesan dan wrapper ephemeral/view-once.
- Validasi pesan yang direply harus berupa imageMessage sebelum mengunduh foto.
- Menggunakan downloader dari konteks pesan untuk mengunduh foto yang direply.
- Mode official menolak URL kosong/tidak valid dan tidak lagi melaporkan sukses palsu.
- Gambar menu dikirim sebagai pesan media WhatsApp terpisah sebelum menu interaktif agar tidak bergantung pada dukungan media di header interactive.
- Jika gambar gagal dimuat/dikirim, menu menampilkan peringatan yang bisa ditindaklanjuti.

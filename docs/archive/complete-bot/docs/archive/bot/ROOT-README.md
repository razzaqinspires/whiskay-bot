<div align="center">

# WHISKAYBOT
### Modular WhatsApp Automation · Razzaq Ventures Ecosystem

**A private-first, extensible WhatsApp bot with interactive menus, media tools, progression systems, and an integration bridge to the official Razzaq Ventures platform.**

[![Version](https://img.shields.io/badge/version-2.3.9-17243b?style=for-the-badge)](package.json)
[![Runtime](https://img.shields.io/badge/Node.js-20%2B-2f855a?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Baileys%207-176b5b?style=for-the-badge&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![Ecosystem](https://img.shields.io/badge/Ecosystem-Razzaq%20Ventures-c9aa66?style=for-the-badge)](https://razzaq-ventures-platform.vercel.app/)

**The operating principle:** useful automation, visible boundaries, auditable changes, and no secret-bearing files in source control.

[Official Website](https://razzaq-ventures-platform.vercel.app/) · [Website Repository](https://github.com/razzaqinspires/razzaq-ventures-platform) · [Setup](#-quick-start) · [Command Index](#-command-atlas) · [Security](#-security-and-data-boundaries)

</div>

---

## 01 · Project identity

WhiskayBot is the WhatsApp automation layer in the **Razzaq Ventures** ecosystem. Its source is organized around small command plugins rather than a single monolithic command file. The bot provides user-facing WhatsApp experiences and can call the official website's versioned API when the website-side integration is configured and implemented.

| Attribute | Current project definition |
|---|---|
| Product | WhiskayBot |
| Maintained for | Razzaq Ventures ecosystem |
| Runtime | Node.js 20+ / ECMAScript modules |
| WhatsApp transport | `@whiskeysockets/baileys` `7.0.0-rc14` |
| Plugin entry | `src/plugins/` |
| Local operational data | `data/` (runtime-generated; do not commit live user data) |
| Official web property | [razzaq-ventures-platform.vercel.app](https://razzaq-ventures-platform.vercel.app/) |
| Website source repository | [razzaqinspires/razzaq-ventures-platform](https://github.com/razzaqinspires/razzaq-ventures-platform) |

> **Integration status matters.** The website repository's README and architecture note may lag the current route implementation. The current source for `/api/v1/integrations` imports `writeRecord` from `src/lib/rv-store.ts`, and `/api/v1/analytics` reads stored sales/expense records from Supabase. This means the code path supports persistence, but production success still depends on Vercel secrets, the `rv_records` table, schema/policies, and live verification. Website visitor-hit analytics remain a separate feature and are not currently implemented by this bot. See [Official website integration](#-official-website-integration).

## 02 · Architecture map

```text
WhatsApp user / group
        │
        ▼
Baileys transport → Serializer → CommandHandler → Middleware
                                             │
                      ┌──────────────────────┼──────────────────────┐
                      ▼                      ▼                      ▼
                General plugins         Tools / games          Owner plugins
                menu, profile, ping     YouTube, scrape        website, worker
                      │                      │                      │
                      └──────────────────────┼──────────────────────┘
                                             ▼
                                  Local data + audit boundaries
                                             │
                                             ▼
                         Razzaq Ventures versioned website API
                         health / integrations / analytics contract
                                             │
                                             ▼
                            Website repository → Next.js / Vercel
                            Persistence and hit analytics require
                            website-side implementation and verification
```

### Design principles

- **Plugin-oriented:** commands are grouped by purpose and can be extended without rewriting the entire bot.
- **Interactive-first:** supported WhatsApp clients receive quick replies or selection lists; readable text fallback remains important.
- **Local state is not cloud persistence:** JSON files in `data/` live on the bot host unless a separate backup/replication policy is configured.
- **Website API is the boundary:** the bot must not receive Supabase service-role credentials or execute arbitrary commands from remote payloads.
- **Operational history is not visitor analytics:** Git commit/deployment history records source changes; website page hits must be collected by the website itself with an explicit privacy and retention policy.

## 03 · Quick start

### Requirements

- Node.js 20 or newer
- npm
- A WhatsApp account/session permitted for the deployment
- `yt-dlp` and FFmpeg for YouTube download features
- FFmpeg for the RPG landscape PNG card renderer (if unavailable, RPG commands should still return interactive text with a rendering warning)

### Install and configure

```bash
npm install
cp .env.example .env
```

Set at least the owner number and the bot's runtime configuration in `.env`:

```dotenv
BOT_NAME=WhiskayBot
PREFIXES=.,!,/,#
OWNERS=628xxxxxxxxxx
LOG_LEVEL=info
```

Never commit `.env`, WhatsApp `sessions/`, real API tokens, service-role keys, or personal runtime data. Use `.env.example` as the shareable template.

### Start

```bash
npm start
```

Development mode:

```bash
npm run dev
```

For a fresh deployment, verify the WhatsApp session, owner authorization, plugin loading, and actual interactive behavior from a second WhatsApp client. Syntax checks alone are not an end-to-end test.

## 04 · Command atlas

The examples below use `.` as the prefix. The active prefix list is configured by `PREFIXES`.

### Core and engagement

| Command | Purpose |
|---|---|
| `.ping` / `.p` | Runtime diagnostic card with response time, uptime, RSS memory, and Node version; falls back to interactive WhatsApp content if AIRich is unavailable. |
| `.menu` | Show the configured command menu. |
| `.setmenu` | Open per-user menu customization. |
| `.setmenu template corporate\|minimal\|terminal\|elegant` | Select a menu template. |
| `.setmenu mode buttons\|text` | Choose interactive or text-oriented mode. |
| `.setmenu image` | Configure menu image mode. |
| `.leveling on\|off\|status` | Enable or inspect group XP leveling; requires group admin or owner. |
| `.profile` | Show profile, rank, XP, economy, familiarity and premium status available to that profile. |
| `.profile image` | Choose automatic official landscape canvas, a personal photo, or no image. The official canvas is generated locally from profile stats; no `PROFILE_CARD_IMAGE_URL` is needed. |
| `.rankmatrix` | Show rank thresholds. |
| `.levelnotify` | Open the notification controls. |
| `.levelnotify on\|off` | Change the setting; button-triggered changes return a one-shot text confirmation without re-rendering the buttons. |

### YouTube tools

| Command | Purpose |
|---|---|
| `.ytsearch query` | Search up to 25 public results and open a selection list. Selecting a title opens a thumbnail-backed preview; it does not download immediately. |
| `.ytplay query` | Search and show the same preview-first result flow. The “Putar Hasil Pertama” action remains available; a direct YouTube URL opens its preview first. |
| `.ytmp3 URL` | Download public video audio as MP3. |
| `.ytmp4 URL` | Download public video as MP4, targeting up to 720p. |
| `.ytpreview URL` | Open a video preview with thumbnail, title, channel, duration, view count and format buttons. |
| `.ytpage [page]` | Navigate the active search results. Use a page number, `next`, or `prev`; no query is required while the current search session is active. |
| `.ythelp` | Open the YouTube command guide. |

**Server dependencies:** `yt-dlp` and FFmpeg must be installed and available on `PATH`. The current plugin targets files up to 48 MB. Search retrieves up to 25 results, paginated as 10 rows per WhatsApp list page to respect interactive-list limits. The list uses the same `single_select` → `sections` → `rows` schema as `.menu` and `.setmenu`; each row's `id` routes to `.ytpreview pick N`. The active query/results are cached per chat and sender for page navigation and selection. Use `.ytpage next` or `.ytpage prev` while the search session remains in memory. Choosing a row opens a thumbnail-backed preview card with explicit Audio MP3 and Video MP4 actions; the list itself does not start a download. The search card keeps “Putar Hasil Pertama” and removes the redundant “Audio MP3 hasil pertama” action. Public videos only; it does not bypass login, private videos, or paywalls. YouTube delivery changes over time, so keep `yt-dlp` updated.

Example on Debian/Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg python3-pip
python3 -m pip install -U yt-dlp
```

If pip refuses a system-wide install, use a virtual environment or the OS-supported package method.

### Dungeon RPG

| Command | Purpose |
|---|---|
| `.rpg` / `.dungeon` | Open the RPG dashboard. |
| `.rpg status` | View level, rank, XP, HP, gold, weapon, floor, victories and potions. |
| `.rpg explore` | Enter a turn-based encounter for XP and loot. |
| `.rpg potion` | Use a potion to restore HP. |
| `.rpg rest` | Spend gold to restore HP at camp. |
| `.rpg help` | Read the field guide. |

RPG state is saved in `data/dungeon-rpg.json` per chat and player key. The profile card also renders a dynamic 1200×675 landscape canvas from live profile stats; it does not rely on an externally configured official-image URL. Landscape cards are rendered to PNG through FFmpeg and sent separately from the interactive action card. If the host has no FFmpeg or WhatsApp media delivery fails, the command should fall back to a text/interactive response. The game is entertainment, not a financial or reward system.

### Public page extraction

| Command | Purpose |
|---|---|
| `.scrape https://example.com` | Read a public HTML/plain-text page title, metadata description and a short text excerpt. |

The scraper is intentionally bounded by response size and timeout. It is not a full browser, does not execute JavaScript, and must not be used to access private or authenticated resources. URL and network hardening should be reviewed before exposing it to untrusted users.

### Owner-only website integration

| Command | Purpose |
|---|---|
| `.webstatus` / `.webview` | Check the official website health endpoint. |
| `.webhelp` | Show owner integration guidance. |
| `.webset key \| value` | Submit an allowlisted public-content update event. |
| `.websale {JSON}` | Submit a sales record event. |
| `.webexpense {JSON}` | Submit an expense record event. |
| `.webproduct {JSON}` | Submit a product update; with no payload, attempts to read the public product catalogue. |
| `.webreport` | Request the website analytics summary endpoint. |
| `.webpush event.name {JSON}` | Submit an advanced event envelope; the website must validate its schema. |

Aliases include `.rvstatus`, `.rvset`, `.rvsale`, `.rvexpense`, `.rvproduct`, `.rvreport`, `.rvpush`, and `.rvhelp`. These commands are owner-only. The API contract and actual production persistence must be verified on the website side before using them as business records.

### Other operational tools

| Command | Purpose |
|---|---|
| `.worker` | Owner-only worker/monitor console; inspect output before enabling in production. |
| `.hrlog`, `.watchlog`, `.changelog` | Operational log/history utilities where present in the loaded plugin set. |
| `.zip` | Owner-oriented source packaging utility where enabled. |

The loaded plugin registry is the source of truth. This table is a maintained overview, not a promise that every deployment has every optional plugin enabled.

## 05 · Profile canvas, notifications and preview UX

- The official profile canvas is generated locally as a 1200×675 PNG using the user's level, XP progress, rank, economy, familiarity/role and premium state. `PROFILE_CARD_IMAGE_URL` is legacy and no longer required.
- `MENU_IMAGE_URL` remains a separate optional URL for the official menu image; it does not control the profile canvas.
- `.levelnotify` opens controls once. Choosing **Aktifkan** or **Nonaktifkan** changes the state and returns plain text without another button row, preventing accidental repeat-tap loops.
- YouTube selection is preview-first: selecting a result shows its thumbnail and metadata plus explicit MP3/MP4 actions. No download begins until a format action is selected.

## 06 · Official website integration

**Official website:** <https://razzaq-ventures-platform.vercel.app/>  
**Source repository:** <https://github.com/razzaqinspires/razzaq-ventures-platform>

The website is a separate Next.js App Router + React + TypeScript project. It owns public pages, the public venture/product content, and the versioned API contract. WhiskayBot calls the API from the server side through `src/services/razzaqWebsite.js` and exposes owner-only command wrappers in `src/plugins/owner/website.js`.

### Environment contract

Bot host `.env`:

```dotenv
WEBSITE_BASE_URL=https://razzaq-ventures-platform.vercel.app
WEBSITE_API_TOKEN=use-the-same-random-secret-as-INTEGRATION_API_TOKEN
WEBSITE_API_TIMEOUT_MS=8000
```

Website Vercel environment (server-side only):

```dotenv
INTEGRATION_API_TOKEN=long-random-secret
```

The bot token must match `INTEGRATION_API_TOKEN`. It is not a Supabase key. The bot should never need `SUPABASE_SERVICE_ROLE_KEY` or any database administrator credential. After environment changes, redeploy the website and restart the bot as appropriate.

### Current source-of-truth caveat

The website repository's README/architecture documentation appears behind the current route implementation. The current source for `src/app/api/v1/integrations/route.ts` calls `writeRecord`, which writes validated events to the Supabase `rv_records` table through `src/lib/rv-store.ts`; `src/app/api/v1/analytics/route.ts` reads sales and expenses from that store. The code therefore includes a persistence path, subject to valid Vercel environment variables, table/schema/policies, and successful production verification.

- `.webstatus` proves only that the health endpoint responds.
- `.webpush`, `.websale`, `.webexpense`, `.webproduct`, and `.webset` submit authenticated event envelopes and the route attempts to persist valid records. Confirm Vercel logs and Supabase rows before relying on them.
- `.webreport` summarizes recorded sales/expenses; it is not a complete accounting or tax report.
- Website visitor hits are **not** currently captured by the bot or these sales/expense analytics endpoints. Page-view instrumentation, aggregation, consent/notice, retention, and a dedicated dashboard/API must be implemented in `razzaq-ventures-platform`.

To verify a real integration, test the route and expected response on the deployed site, inspect Vercel logs, and confirm a corresponding database record in the website's configured storage. Do not describe a syntax check or HTTP 200 as proof of persistence.

## 06 · Operational history and visitor analytics

This repository separates three data classes so that source history does not accidentally become a private-user data dump.

| Data class | Proper location | Included in Git? |
|---|---|---|
| Source changes / release history | Git commits and the optional `docs/history/updates.jsonl` workflow ledger | Yes, metadata only |
| Runtime diagnostics / game profiles / local settings | Bot host `data/` and logs | No, exclude live data |
| Website page hits and traffic aggregates | Website analytics implementation in the website project or a dedicated analytics service | Not as raw visitor records in the bot repo |

The optional GitHub Actions workflow in `.github/workflows/repo-update-history.yml` records a minimal source-update ledger entry after pushes. It is designed to avoid recording WhatsApp message bodies, phone numbers, IP addresses, cookies, session identifiers, or secrets. GitHub commit history is an audit trail for **code updates**, not a visitor analytics database.

**Visitor-hit tracking is not yet implemented by this bot package.** It must be added to the website repository at the request/route layer, ideally with aggregated counts and data minimization. Do not send raw IP addresses, complete user-agent strings, or identifying query parameters into a public repository. If the website later emits a daily aggregate to GitHub, use a private repository, strict retention, a dedicated least-privilege token, and a workflow that cannot expose secrets in logs. Prefer database-backed analytics for production dashboards.

### Enable the repository update ledger

1. Push this source to a GitHub repository.
2. In **Settings → Actions → General → Workflow permissions**, allow read/write permissions if your organization policy requires this toggle.
3. Confirm the workflow has `contents: write` and that repository policy permits `GITHUB_TOKEN` to push commits.
4. A subsequent push will append metadata to `docs/history/updates.jsonl`; the workflow ignores changes to that ledger path to avoid a recursive loop.
5. Review the resulting commit and Actions run. If repository policy blocks token pushes, use an approved bot token with narrowly scoped repository contents permission; never paste it into source code.

## 07 · Data layout

```text
src/
├── config/                 Environment configuration
├── core/                   Serializer, command handling, middleware
├── handlers/               Message/level-up handlers
├── lib/                    Interactive helpers, profiles, menu settings
├── services/
│   └── razzaqWebsite.js    Server-side official website API client
└── plugins/
    ├── general/            Ping, menu, profile, leveling
    ├── games/               Dungeon RPG
    ├── owner/               Website and operational controls
    └── tools/               YouTube, scrape and information tools

docs/
├── RAZZAQ-WEBSITE-INTEGRATION.md
├── README-MENU-UPDATE.md
├── README-UPDATE-2.3.4.md
├── README-YOUTUBE-2.3.5.md
└── history/                Source-update metadata ledger (no user content)
```

## 08 · Verification and release discipline

Before shipping a release:

```bash
node --check src/plugins/general/ping.js
node --check src/plugins/games/rpg.js
node --check src/plugins/tools/youtube.js
node --check src/plugins/tools/scrape.js
npm start
```

Then test in a real WhatsApp session:

- Ping rich card and its interactive fallback.
- RPG start, explore, victory/defeat, potion, rest, persistence after restart, image rendering and media sending.
- YouTube search, button selection, MP3/MP4 size limits and clean temporary-file handling.
- Menu/profile image modes using valid direct image URLs.
- Owner authorization and the website health endpoint.
- Website event persistence only after website-side storage is implemented.

Keep a release note with verified results. Mark live WhatsApp, production API, and database checks separately from syntax/ZIP checks.

## 09 · Security and data boundaries

- Never commit `.env`, `sessions/`, Supabase secrets, API tokens, raw user messages, or private operational logs.
- Do not store raw website visitor identifiers in Git commits or public artifacts.
- Treat scraped HTML and API payloads as untrusted input; escape values before inserting them into HTML.
- Keep owner commands behind the existing owner check; do not add remote arbitrary-code execution.
- Apply timeouts, payload limits, rate limits, and cleanup to external processes and HTTP calls.
- YouTube tools must not bypass access controls or private-video restrictions.
- RPG data is local gameplay state; back it up only if the host's privacy and retention rules permit it.
- The update-history workflow writes commit metadata only. Review its permissions and output before enabling it on a public repository.

## 10 · Maintained reference documents

The documents below preserve detailed implementation notes from each feature wave. This README is the primary map; the feature notes remain the deeper change-specific references.

- [`README-MENU-UPDATE.md`](docs/README-MENU-UPDATE.md) — menu settings, image handling, profile/leveling history, compatibility notes.
- [`README-UPDATE-2.3.4.md`](docs/README-UPDATE-2.3.4.md) — profile/menu image fixes and bounded public-page scrape command.
- [`README-YOUTUBE-2.3.5.md`](docs/README-YOUTUBE-2.3.5.md) — YouTube commands, server dependencies and limits.
- [`RAZZAQ-WEBSITE-INTEGRATION.md`](docs/RAZZAQ-WEBSITE-INTEGRATION.md) — website API contract, owner commands, environment and verification steps.
- [`ANALYTICS-AND-AUDIT.md`](docs/ANALYTICS-AND-AUDIT.md) — distinction between Git update history, bot logs and website visitor analytics.

## 11 · Roadmap

- [x] Plugin architecture and interactive menu controls
- [x] YouTube search/download command layer
- [x] Runtime-rich ping card with fallback
- [x] Initial turn-based dungeon RPG with persistent local state and landscape PNG card
- [x] GitHub source-update ledger workflow (opt-in by repository policy)
- [ ] Production website event persistence and verified reporting
- [ ] Privacy-aware website visitor analytics and aggregate API
- [ ] Automated tests for plugin behavior and rich-card compatibility
- [ ] Structured release workflow with tested artifacts and rollback notes

---

<div align="center">

**WHISKAYBOT**  
*Automation with a clear boundary between what is implemented, what is configured, and what has been verified.*

Part of the Razzaq Ventures digital ecosystem · [Official website](https://razzaq-ventures-platform.vercel.app/)

</div>

## RPG expansion commands
- `inventory` / `inv` — list item IDs and equipment status.
- `equip <weapon|armor|accessory> <item-id>` and `unequip <slot>`.
- `use potion [item-id|number]` or `usepotion` — use a consumable.
- `buff`, `dungeon enter|floors|exit`, `adventure enter|exit`, `guild create <name>`, `guild info`, `quest`, `weather`, and `map`.

The website sync endpoint requires matching `DUNGEON_SYNC_TOKEN` on the bot and `BOT_SYNC_TOKEN` on the website, plus configured Supabase credentials. Without these settings, the website uses local save and bot sync is skipped by design.

## Aetheria Gacha update

- `gacha rates` — banner rates, current pity, and gem balance.
- `gacha summon 1` / `gacha summon 10` — spend 30 / 270 Aether Gems.
- `gacha daily` — claim 40 Aether Gems once every 24 hours.
- `gacha history` / `gacha collection` — view recent pulls and collected spirits.
- Rates: SSR 3%, SR 17%, R 80%; hard pity guarantees SSR on the 50th pull since the last SSR. Duplicate spirits are converted to spirit shards.
- Tests: `npm test` (Node's built-in test runner; no extra test dependency).


## Stage 11 — Berita & Broadcast

- `.berita [topik]` mengambil berita melalui Google News RSS publik (tanpa API key), dengan timeout.
- `.bc pesan` mengirim pengumuman ke grup yang diikuti bot; `.bc --users pesan` mengirim ke grup dan nomor yang tercatat di `data/registered-users.json`.
- Broadcast dibatasi untuk owner (`OWNERS` di `.env`), berjalan bertahap, dan melaporkan jumlah berhasil/gagal. Jangan gunakan untuk spam.
- `data/registered-users.json` bersifat opsional; format: `{ "users": ["628123456789@s.whatsapp.net"] }`. Masukkan hanya pengguna yang memang mendaftar/menyetujui pesan.


## Tahap 12–13: Sticker Maker & AI Chat

- `.s` / `.sticker`: reply gambar atau video hingga 10 detik untuk membuat stiker WebP. Memerlukan `ffmpeg`; `webpmux` opsional untuk metadata pack. Input dibatasi 20 MB dan output 1 MB.
- `.ask <pertanyaan>` / `.ai <pertanyaan>`: asisten percakapan. Isi `AI_PROVIDER=openai` atau `AI_PROVIDER=gemini`, lalu set `OPENAI_API_KEY` atau `GEMINI_API_KEY`. Pilihan tambahan: `OPENAI_MODEL`, `GEMINI_MODEL`, `AI_SYSTEM_PROMPT`, `STICKER_PACK_NAME`, `STICKER_AUTHOR`.
- Jangan commit `.env` atau API key. Fitur AI mengirim prompt ke provider yang dikonfigurasi.

# Stage 69 — Westmanga Commands & Energy Ledger Reliability

## Objectives
Install WhatsApp commands for the supplied Westmanga scraper, preserve the friend's source unchanged, safely expose chapter downloads, correct menu energy labels, and repair energy/XP notification delivery.

## Protected source
- `src/lib/external/westmanga/westmanga-scraper.cjs` remains byte-identical.
- SHA-256: `59247bda46d1404cf643a76c4c34ba7bec95c90e3ef94095bdce2254bce4c20b`
- All command behavior and download restrictions live in adapter/controller files.

## Commands
- `.wm` — interactive entry point.
- `.wmhome` — home feed.
- `.wmsearch <keyword>` — search.
- `.wmdetail <slug-or-url>` — comic details.
- `.wmread <chapter-slug-or-url>` — chapter image URLs.
- `.wmdownload <chapter-slug-or-url>` — download pages into the server's allowed data directory.
- `.wm status` — provider/controller status.

## Download security boundary
`src/services/WestmangaDownloadGuard.js`:
- HTTPS only; exact allowlist: `v1.westmanga.my`, `westmanga.my`, `westmanga.site`.
- Reject URL credentials, non-443 ports, and untrusted hosts.
- Resolve DNS and reject private/reserved addresses.
- Redirects are manual and every redirect target is revalidated; maximum 4.
- Require image content-type and supported image extension.
- Maximum 15 MiB per image, 100 MiB per chapter, 120 pages, 30-second request timeout.
- Destination is constrained to `data/downloads/westmanga`; symlink components are rejected.
- Existing output files are not overwritten. On a later page failure, files created during that attempt are removed.
- The original third-party `downloadFile`/`downloadChapter` are not called because their built-in fetch follows redirects without enforcing this policy. The adapter uses the supplied library's `getChapterImages()` to obtain source metadata and applies the guarded downloader separately.

## Energy/menu corrections
- `menu.js` does not show a numeric cost when workload mode is `exempt`; it retains the free marker.
- `setmenu energy-xp on|off` updates both notification switches. Enabling from `batteryNotification=hide` switches delivery to `separate`.
- `setmenu energy-notice on` also exits `hide` mode.
- Middleware delivers XP separately if it was awarded after a reply already received the merged energy footer.
- Successful Energy Canvas includes XP exactly once.
- Separate notice title is based on actual content: energy + XP, energy only, or XP only.
- `.energy audit` exposes command count, total spent, remaining energy, charge state, and recent charged commands.

## Energy debit semantics
Paid commands are charged in `energyWorker` middleware before plugin execution. Free commands in `ZERO_COST` or explicitly declared `energyMode: 'free'` remain free. Debit is persisted through the existing cross-process file lock and atomic ledger write. The focused test confirms a 1.25 point debit changes 50.00 to 48.75 and increments total spent/command counters.

## Environment
See `.env.example`:
- `WESTMANGA_RESPONSE_STYLE`
- `WESTMANGA_DEFAULT_PAGE`
- `WESTMANGA_PER_PAGE`
- `WESTMANGA_USER_AGENT_PRESET`
- `WESTMANGA_DOWNLOAD_DIR`
- `WESTMANGA_FALLBACK_ENABLED`

## Verification
- `npm run verify:stage69`
- `npm run verify:stage68`
- `npm run verify:stage67`
- `npm run verify:stage45`
- `npm test`
- `npm run verify:all`

The build workspace ran Stage 69 focused tests. Full regression, production WhatsApp session, and live Westmanga requests/downloads are not claimed as passed.

## Rollback
Revert the Stage 69 files, `package.json`/lock versions and scripts, `.env.example`, README, and changelog. No schema migration is required. Do not delete `data/downloads/westmanga` unless the operator separately chooses to remove downloaded chapters.

# Stage 70.2 — Strict Identity, Westmanga Resilience & Nexora Repair Worker

## Release
- Baseline: v2.35.38 (Part 12.3)
- Release: v2.35.39 (Part 12.4)
- Stage 70 remains split into five parts. This part focuses on message identity policy, runtime command-failure capture, and resilient interactive catalog output.

## Stage 70.2 strict message identity

- Validates remote JIDs against supported user/LID, group, newsletter, and broadcast shapes.
- Requires `id` and boolean `fromMe`.
- Validates participant as a user/LID JID and only permits participant on group messages.
- A lookup with a supplied participant requires an exact match.
- If Baileys omits participant, fallback is permitted only when exactly one stored message matches `remoteJid + id + fromMe`; collisions return a miss rather than selecting an arbitrary sender.
- Trusted PN/LID alias expansion remains Stage 70.3; this part does not guess identity aliases.

## Westmanga incident analysis

Observed log:
`Seluruh provider Westmanga gagal atau tidak tersedia. list.map is not a function`

The supplied scraper's `getHome()` normalizer calls `.map()` directly on the API values `mirror_update`, `popular`, `new_project`, and `project_update`. It assumes each value is an array. A null/object/wrapped API response violates that assumption before the controller receives a result.

The original source file `src/lib/external/westmanga/westmanga-scraper.cjs` is intentionally unchanged. The controller now uses the scraper's exported `fetchApi()` transport to call the same `/api/contents/home-data` endpoint and normalizes the response in a separate pure helper.

## Files changed

### Added
- `src/services/westmanga-normalizer.js`
  - Accepts arrays, null/undefined, and known wrappers (`data`, `items`, `results`, `list`).
  - Normalizes the four home sections and nested lastChapters.
  - Drops entries without a usable slug.
- `src/services/nextora-repair/NextoraRepairService.js`
  - Persistent command failure queue in `data/nextora-repair/queue.json`.
  - Bounded dependency inspection (up to eight relative source files).
  - AI repair proposal using configured OpenAI or Gemini endpoint.
  - Proposal is restricted to replacing the exact failing plugin/service source file.
  - Target paths are restricted to `src/plugins/` and `src/services/`; critical paths such as auth/security/outbound policy/message repository/persistent store/Nextora itself are denied.
  - Candidate patch is staged under `data/nextora-repair/proposals/`.
  - Testing copies the project into a temporary sandbox, substitutes the candidate file, runs `node --check` and the project's `verify:all` or `test` script.
  - Save is allowed only after a passing sandbox test and a second source-hash check.
  - Existing source is backed up as `<file>.nextora-<task-id>.bak`.
- `src/jobs/NextoraRepairWorker.js`
  - Background queue diagnostic worker, every 30 seconds.
- `src/plugins/owner/nextora-repair.js`
  - Owner-only `.nextora inbox|inspect|repair|test|save`.
- `test/stage70-2-westmanga-nextora.test.js`
  - API shape normalization and persistent repair queue/dependency inspection tests.

### Modified
- `src/services/WestmangaLibraryController.js`
  - Bypasses the unsafe `getHome()` normalizer without editing the supplied scraper.
  - Uses exported `fetchApi()` and `toAbsoluteImageUrl()` from the original source module.
- `src/plugins/general/westmanga.js`
  - `.wmhome` now renders a carousel for image-backed items.
  - `.wmsearch` renders result cards with detail actions.
  - `.wmdetail` renders an interactive chapter selector.
  - `.wmread` renders chapter pages as a carousel when media is available.
  - Falls back to native list/select when carousel upload or relay fails.
- `src/core/serializer-compat.cjs`
  - Adds `sock.sendCarousel()` and `m.sendCarousel()`.
  - Uses Baileys `proto`, `prepareWAMessageMedia`, `generateWAMessageFromContent`, and `relayMessage`.
  - Caps at 10 cards and restricts image hosts to Westmanga and MyAnimeList CDN hosts.
- `src/plugins/tools/anime-search.js`
  - Anime/manga search results use image carousel cards.
  - Adds `.animeinfo <mal_id>` and `.mangainfo <mal_id>` detail routes.
  - Falls back to an interactive list when image cards cannot be delivered.
- `src/core/CommandHandler.js`
  - Captures command exceptions as repair tasks.
  - Sends an owner-only private interactive notification with a single “Perbaiki dengan Nexora” action.
  - Does not send stack traces or patch contents to ordinary users.
- `package.json`, `package-lock.json`
  - Version `2.35.39`.
  - Adds `verify:stage70-2` to `verify:all`.
- `.env.example`, `README.md`, `CHANGELOG.md`.

## Owner workflow

1. A command fails. The user receives a neutral error notice; the owner receives a private button with a task ID.
2. `.nextora inspect <id>` displays bounded source/dependency analysis.
3. `.nextora repair <id>` asks configured AI provider for a single-file replacement proposal. Production source is not changed.
4. `.nextora test <id>` copies the project to a sandbox, applies the candidate there, runs syntax check and the existing verification suite.
5. `.nextora save <id>` applies the tested candidate only after owner action and verifies that the source has not changed since proposal generation/testing.
6. A backup is retained beside the modified source. Plugin reload is a separate owner action.

The scheduled worker performs queue triage/dependency inspection only. It does not silently patch production files.

## Configuration

- `NEXTORA_REPAIR_WORKER_ENABLED=true`
- `NEXTORA_REPAIR_PROVIDER=openai` (`openai` or `gemini`)
- `NEXTORA_REPAIR_MODEL=` (optional)
- OpenAI provider uses `OPENAI_API_KEY`; Gemini provider uses `GEMINI_API_KEY`.
- `WHISKAY_DATA_DIR` controls the repair queue/proposal/sandbox data root.

If credentials are not configured, task capture and diagnosis still work; proposal generation returns a clear configuration error.

## Safety boundaries

- AI output is untrusted. It can only target the same failing source file.
- Only plugin/service files are eligible; core, security, auth, outbound policy, persistent stores, tests, package manifests, and Nextora repair code are not eligible.
- A passing test is mandatory before save.
- Save is a separate owner action; no auto-commit, auto-push, or automatic restart is performed.
- Test sandbox excludes runtime data, sessions, Git metadata and the live node_modules tree; it links node_modules read-only by convention. Tests must not be considered a hostile-code sandbox.
- Owner access is enforced by the existing command handler and plugin owner flag.
- Carousel media URLs are HTTPS and host-allowlisted. The original Westmanga scraper source remains unchanged.

## Stage 70 boundaries

Stage 70.2 does not yet finish PN/LID trusted identity mapping or the complete retry protocol lifecycle. The Stage 70 plan remains:
- 70.1 Persistent message repository — complete.
- 70.2 Strict identity + error/repair infrastructure — complete in this release.
- 70.3 Trusted PN/LID identity resolver — pending.
- 70.4 Message secret/protocol preservation — pending.
- 70.5 Retry integration, recovery, and full QA — pending.

## Verification

- `npm run verify:stage70-1`: 6/6 passed, including strict JID/participant validation and ambiguous participant-less lookup.
- `npm run verify:stage70-2`: 3/3 passed.
- Syntax check across 371 JS/CJS/MJS files: 0 failures.
- Carousel live delivery against an active WhatsApp account: not run.
- Live Westmanga API: not run in this workspace.
- Full `npm test` / `npm run verify:all`: not run.
- AI-generated patch lifecycle with real API credentials: not run.
- Production apply/reload and WhatsApp user-client rendering: not run.

## Rollback

1. Stop the bot cleanly.
2. Back up `data/nextora-repair/` if repair history/proposals should be retained.
3. Restore v2.35.38 source.
4. Keep `data/message-repository/` untouched (Stage 70.1 data remains compatible).
5. If a Nexora-saved source file must be reverted, restore its corresponding `.nextora-<task-id>.bak` backup before reloading plugins.
6. Do not delete the original protected Westmanga scraper.

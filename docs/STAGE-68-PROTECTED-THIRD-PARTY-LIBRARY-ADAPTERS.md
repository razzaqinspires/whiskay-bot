# Stage 68 — Protected Third-Party Library & Adapter Foundation

## Baseline and intent
- Baseline: WHISKAY-BOT v2.35.33 (Part 10, Stage 67).
- Release: v2.35.34 (Part 11, Stage 68).
- The Westmanga scraper supplied by the user is treated as an immutable third-party source. Its CommonJS code is stored as `.cjs`; it is not refactored, reformatted, translated, or patched.

## Source preservation
- Source: `src/lib/external/westmanga/westmanga-scraper.cjs`.
- SHA-256: `59247bda46d1404cf643a76c4c34ba7bec95c90e3ef94095bdce2254bce4c20b`.
- File mode: read-only (0444) in the release workspace.
- Protected zone: `src/lib/external/**`.
- `SourceWatcher`, `JavaScriptModulePolicy`, deterministic Git repair, and NEXORA repair exclude this zone.

## Adapter/controller
- `src/services/WestmangaLibraryController.js` loads CommonJS using Node's `createRequire` and isolates integration logic outside the supplied file.
- Supports home, search, comic detail, and chapter read operations. The source download function is deliberately not exposed because its URL/redirect/size boundaries have not yet been wrapped by a safe adapter.
- Supports compact/minimal/detailed response formatting, safe target validation, provider health/cooldown bookkeeping, and explicit fallback provider registration.
- Only the Westmanga provider is currently registered. No fictional secondary scraper or working fallback is claimed.
- No WhatsApp command is added in this stage; command UX is deliberately deferred until the adapter contract is verified.

## Future integration contract
1. Every supplied source gets its own protected folder and original extension/module format.
2. Preserve the source and its credits/watermark byte-for-byte.
3. Put all configuration, style, normalization, retry, fallback, and lifecycle logic in adapters outside `src/lib/external/**`.
4. Register a fallback only after a separate provider is supplied or implemented and independently tested.
5. Add commands only after the adapter has stable tests and the user requests command integration.

## Verification
Run `npm run verify:stage68`. Tests verify source checksum, reload exclusion, deterministic and AI repair exclusion, CJS loading, target validation, and response formatting. Network calls to Westmanga are not part of deterministic CI tests.

## Limitations
- The upstream API and website may change; successful syntax/import tests do not prove live API availability.
- The supplied source's own request behavior and implementation are intentionally untouched, including its existing limitations.
- The supplied source includes download functions, but the controller blocks downloads until a separate safe downloader validates CDN hosts, redirects, file size, and output paths. WhatsApp media delivery is also deferred.

## Rollback
Remove the adapter, test, and documentation and revert package metadata. Do not delete or rewrite the original protected source without explicit user instruction.

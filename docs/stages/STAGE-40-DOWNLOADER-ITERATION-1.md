# Stage 40 — Downloader Feature Parity, Iteration 1

## Implemented

Added adapters that reuse `src/services/mediaDownloader.js`:

- Pinterest: `.pinterestdl`, `.pindl`
- MediaFire: `.mediafire`, `.mediafiredl`, `.mf`
- Spotify: `.spotify`, `.spotdl`, `.spodl`
- YouTube URL download: `.ytmp4`, `.youtube`, `.ytdl`, `.youtubedl`
- RedNote / Xiaohongshu: `.rednote`, `.renotedl`, `.xiaohongshu`

Existing TikTok, Instagram, Facebook and `.dlselect` remain. All platform adapters require a configured `MEDIA_DOWNLOADER_API_URLS` or `MEDIA_DOWNLOADER_API_URL`. The provider contract is a JSON object with any available `videoHD`, `videoSD`, `audio` and optional `thumbnail` URL fields. The service does not include a scraping/downloading backend.

## Deferred / limitations

- YouTube search and interactive search-to-download flow are not implemented in this iteration.
- GitHub clone ZIP flow from the source project is not a media downloader and is deferred to a tools/repository parity audit.
- Spotify provider rights, region, and output availability vary; use only content and services you are authorized to download.
- Provider API behavior and live WhatsApp media delivery were not tested against real services.

## Verification

Run `npm run verify:stage40` and `npm run verify:all`. Tests validate host allowlists, URL scheme/credential checks, provider configuration, and plugin inventory without making network requests.

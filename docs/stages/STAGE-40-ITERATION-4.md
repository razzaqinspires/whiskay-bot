# Stage 40 — Iteration 4: Downloader Alias Audit

## Scope

This iteration audits command names listed in the Experimental-Bell downloader inventory against the current Whiskay plugin registry. It focuses on aliases and format-picker completeness, without changing the shared provider API contract.

## Changes

- Added Facebook aliases `facebookdl` alongside `fb` / `fbdl`.
- Added Instagram alias `instagramdl` alongside `ig` / `igdl` / `instagram`.
- Added TikTok aliases `tt`, `tiktokdl`, `tiktokaudio`, `ttaudio`, `tiktokvn`, and `ttvn` alongside existing names.
- Added YouTube downloader alias `youtubedownloader` alongside `ytdl` / `youtubedl` (the `.youtube` and `.yt` commands remain owned by the search/preview plugin to avoid command collision).
- Confirmed the existing MediaFire, Pinterest, Spotify, and RedNote aliases and added regression checks for their source inventory.
- Expanded `.dlvlink URL` to show MP3, M4A, Opus voice-note, and MP4 options.
- Corrected `.ytplay` / `.play` description so it accurately says it searches and previews before the user chooses a download.

## Important behavior notes

- The platform aliases use the shared provider picker. Audio/voice-note aliases do not promise a dedicated transcoding pipeline; the provider must return the relevant format and the user selects among returned formats.
- `.youtube` and `.yt` are intentionally search/preview aliases from `src/plugins/tools/youtube.js`. The provider-based direct-download adapter remains available as `.ytmp4`, `.ytdl`, `.youtubedl`, and `.youtubedownloader`.
- Live third-party API responses and actual WhatsApp media sends are not tested by the offline suite.

## Verification

See `TEST-REPORT-STAGE-40-ITERATION-4.md` for the exact commands and outcomes.

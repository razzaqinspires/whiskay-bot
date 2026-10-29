# Stage 40 — Iteration 3: YouTube downloader command parity

## Scope

This iteration continues the downloader parity audit against the Experimental-Bell command family. It closes several command gaps in the current Whiskay implementation without replacing its safer `yt-dlp` based download flow.

## Added or expanded commands

- `.ytm4a URL` — extracts audio to M4A.
- `.playvn URL` — extracts Opus audio and sends it as a WhatsApp voice note (`ptt: true`).
- `.dlvlink URL` — opens a format picker for audio MP3, audio M4A, or voice note.
- `.youtube query` and `.yt query` — aliases for the existing YouTube search/play flow.
- Preview now offers MP3, MP4, and a secondary audio-format picker while respecting the interactive button budget.

Existing `.ytmp3`, `.ytmp4`, `.ytplay`/`.play`, `.ytsearch`/`.yts`, `.ytpage`, `.ytpreview`, and `.ythelp` remain available.

## Dependencies and limits

- `yt-dlp` must be installed on the host or available as a Python module.
- FFmpeg is required for MP3, M4A, and Opus conversion.
- Public, accessible YouTube videos only; max outgoing media size is 48 MB.
- This iteration does not include a live YouTube download or real WhatsApp device test. Unit tests validate command registration and outbound payload metadata.

## Verification

Run:

```sh
node --test test/stage40-downloader-parity.test.js
```

The iteration's focused suite is expected to cover provider URL validation, GitHub clone parsing, downloader command registration, and M4A/Opus WhatsApp payloads. See `TEST-REPORT-STAGE-40-ITERATION-3.md` for actual run results.

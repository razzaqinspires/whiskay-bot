# Test Report — Stage 40 Iteration 2

Date: 2026-10-29
Version: 2.26.1

## Results
- `node --test test/stage40-downloader-parity.test.js`: **17/17 passed**.
- `npm run verify:all`: **passed** when a temporary test-only `dotenv/config` shim was present for subprocess tests. The shim was removed before packaging; it is not included in the release ZIP.
- JavaScript syntax check: recorded at packaging time; see release report.
- ZIP integrity and secret/runtime exclusion scan: recorded at packaging time; see release report.

## Coverage
- Existing platform downloader host allowlists and endpoint configuration.
- GitHub clone parser for `owner/repo`, repository URL, and `owner/repo#branch`.
- Reject non-GitHub hosts, embedded credentials, malformed repo paths, and traversal-like branch input.
- Source registration checks for `.gitclone`, `.yts`, and `.play` aliases.

## Limits
- No live GitHub API/ZIP download was made in unit tests.
- No live WhatsApp document delivery was tested.
- YouTube search/play depends on `yt-dlp`; MP3 conversion depends on FFmpeg.
- External platform downloaders require an explicitly configured API provider. Unit tests do not prove provider availability.

# Test report — YouTube downloader (2026-10-29)

## Automated unit tests

Command: `node --test test/youtube-download.test.js`

| Check | Result |
|---|---|
| MP4 format selector includes separate-stream and generic fallbacks | PASS |
| Audio is sent with Baileys `sock.sendMessage` and `quoted: ctx.raw` | PASS |
| Missing socket produces a clear diagnostic | PASS |

**Result: 3 passed, 0 failed.** This run used the local Node.js test runner and did not contact YouTube or WhatsApp. Live MP3/MP4 delivery remains dependent on installed `yt-dlp`, FFmpeg, public video formats, and a connected WhatsApp session.

## Full project test suite in the supplied source workspace

Command: `npm test`

- 90 tests discovered; 86 passed and 4 failed/errored in this run.
- The failures are environment/dependency related: `dotenv` is absent because dependencies were not installed in the workspace (including `group-control-safety.test.js` and `group-features.test.js`).
- `node --check` passed for all JavaScript files under `src/`, `test/`, and `scripts/`.
- The new YouTube-specific test file passes 3/3.

Do not treat the full suite as green until dependencies are installed with the repository's package manager and `npm test` is rerun. The web bundle also could not be built in this environment: the supplied web archive has no lockfile for `npm ci`, and dependency installation did not finish within the available time.

# YouTube downloader fix — 2026-10-29

## Reported errors

1. `ctx.send is not a function` when sending the MP3 selected by **Putar Hasil Pertama**.
2. `Requested format is not available` for MP4 on a YouTube video that does not offer the requested single-file format.

## Root cause and changes

- The serializer context exposes `ctx.sock` and `ctx.reply`, not `ctx.send`. Media now uses `ctx.sock.sendMessage(ctx.chat, content, { quoted: ctx.raw })` and reports a useful error if the socket is absent.
- MP4 selection changed from a restrictive list of single-file MP4 selectors to `bv*[height<=720]+ba/b[height<=720]/b` with `--merge-output-format mp4`. This chooses separate streams when required and falls back to an available combined format.
- Format-unavailable errors now explain that the extractor may need updating or the public video may not offer the selected formats.
- Temporary files continue to be removed in `finally`; the existing 48 MB send limit remains.

## Tests

`test/youtube-download.test.js` verifies format selector construction, audio payload dispatch through the socket, quoted-message options, and missing-socket diagnostics. These are unit tests; they do not prove a specific live YouTube URL is downloadable. Actual downloads still depend on a current `yt-dlp`, FFmpeg, public video access, extractor compatibility, and WhatsApp upload constraints.

## Operations

```bash
npm test
yt-dlp --version
ffmpeg -version
```

Update `yt-dlp` using the host's supported package manager when YouTube changes its player/extractor behavior. Do not bypass login restrictions or download private/paywalled content.

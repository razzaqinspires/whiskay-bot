# Stage 40 — Iteration 2: YouTube Search/Play & GitHub Clone

## Scope
- Add `.yts` as a short alias for YouTube search.
- Add `.play` as an alias for the existing YouTube query/search flow. Search results still require a user to choose a result and then a media format; the bot does not auto-download arbitrary first results.
- Add `.gitclone` / `.ghclone` to download a ZIP archive from a public GitHub repository.

## GitHub clone safeguards
- Accepts `owner/repo`, `owner/repo#branch`, or a repository URL on `github.com`.
- Rejects embedded credentials, other hosts, malformed paths, invalid branch names, private/missing repositories, and unexpected archive redirect hosts.
- Uses timeouts and streams the archive under a hard 24 MB cap.
- Sends a ZIP document; never extracts or executes repository code.

## YouTube requirements
- Search and preview use the existing `yt-dlp` based tool. Install `yt-dlp` on the host; MP3 conversion requires FFmpeg.
- Media upload is capped at 48 MB in the existing implementation.

## Known limits
- GitHub API availability/rate limits can affect `.gitclone`.
- Runtime GitHub fetch and WhatsApp delivery are not tested against live services in unit tests.
- Provider-based platform downloaders still require external endpoints configured through `MEDIA_DOWNLOADER_API_URLS` / `MEDIA_DOWNLOADER_API_URL`.

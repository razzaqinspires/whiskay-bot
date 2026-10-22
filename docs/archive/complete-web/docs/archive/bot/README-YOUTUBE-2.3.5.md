# WhiskayBot v2.3.5 — YouTube tools

Added plugin `src/plugins/tools/youtube.js` with commands:

- `.ytmp3 URL` — download public YouTube video audio as MP3.
- `.ytmp4 URL` — download public YouTube video as MP4 (up to 720p where available).
- `.ytplay query` — search YouTube and send audio from the first result; can also accept a YouTube URL.
- `.ytsearch query` — search up to five results and show a WhatsApp interactive list/buttons. Choosing a row runs `.ytplay URL`.
- `.ythelp` — command guide with interactive buttons.

## Server requirements

The bot host must have **yt-dlp** and **FFmpeg** installed and available on PATH. The plugin tries `yt-dlp`, then `python3 -m yt_dlp`, `python -m yt_dlp`, and `py -m yt_dlp`. Example on Debian/Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg python3-pip
python3 -m pip install -U yt-dlp
```

If pip reports an externally-managed environment, install yt-dlp in a virtual environment or use the package manager for your operating system. Restart the bot after installing tools.

## Limits and notes

- Public YouTube videos only; no login, private-video, or paywall bypass.
- Max upload target is 48 MB. MP4 selection targets up to 720p to keep files manageable.
- The bot sends actual downloaded media; the server needs enough temporary disk space and network bandwidth.
- YouTube can change its delivery mechanisms; keep yt-dlp updated.
- Syntax checks passed, but live WhatsApp download/search has not been tested in this environment. Validate on the actual server after installing yt-dlp and FFmpeg.

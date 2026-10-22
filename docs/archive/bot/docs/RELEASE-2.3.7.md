# WhiskayBot v2.3.7 — YouTube Preview & Profile Canvas

## YouTube search flow
- Search up to 25 public results.
- Selecting a result opens a thumbnail-backed preview card instead of immediately downloading audio.
- Preview metadata includes title, channel, duration, views and upload date where available.
- Preview actions: **Dapatkan Audio MP3** and **Dapatkan Video MP4**.
- Keep **Putar Hasil Pertama**; remove the redundant **Audio MP3 hasil pertama** action.
- `.ytplay query` now enters the preview-first search flow; `.ytplay URL` opens that URL's preview.

## Level notifications
- `.levelnotify` opens a single control card.
- `.levelnotify on` and `.levelnotify off` change the setting and respond with text only, avoiding a repeated-button loop.

## Profile canvas
- The official landscape profile canvas is generated locally from profile statistics and rendered as PNG through FFmpeg.
- No `PROFILE_CARD_IMAGE_URL` is required.
- Manual photo and no-image modes remain available. Menu image settings remain separate.

## Validation
- JavaScript syntax checks and ZIP integrity are checked locally.
- Live WhatsApp, YouTube availability, media sending and host-specific FFmpeg behavior require deployment-side testing.

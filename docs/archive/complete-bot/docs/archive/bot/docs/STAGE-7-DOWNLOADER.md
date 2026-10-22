# Stage 7 — Interactive downloader

Commands: `.tiktok <url>`, `.ig <url>`, `.fb <url>`. The bot previews metadata and offers HD/SD/audio choices through the existing native-flow helper. A selected choice is bound to the requesting sender/chat and expires after 10 minutes.

Configure `MEDIA_DOWNLOADER_API_URL` to a trusted JSON provider that accepts `platform` and `url` query parameters and returns `{ "title": "...", "thumbnail": "https://...", "videoHD": "https://...", "videoSD": "https://...", "audio": "https://..." }`. The bot does not include or bypass a downloader provider; use a provider you are authorized to use and comply with Meta policies, copyright, privacy and each platform's terms. Native-flow support and delivery depend on the current WhatsApp/Baileys version; a text fallback is provided.

`src/core/serializer.js` is the ESM facade; `src/core/serializer-compat.cjs` retains existing compatibility methods and exports `sendInteractiveMessage`.

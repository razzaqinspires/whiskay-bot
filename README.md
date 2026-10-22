# WHISKAY WhatsApp Bot — Stage 17

Node.js / Baileys WhatsApp bot. This project is independent from the Next.js RPG website; do not merge the two source trees.

## Stage 17 changes
- Group moderation: `.kick @user`, `.add 628...`, `.promote @user`, `.demote @user`, `.linkgroup`.
- RPG field reports: `.explore`; checkpoint link: `.enterdungeon` (15-minute signed link, configured energy cost).
- Media helper: reply to an image with `.meme TOP | BOTTOM` (requires FFmpeg).
- RPG command state loads the latest dashboard snapshot when the website is configured and reports database outages instead of silently replacing a remote profile with level 1.

## Run
1. Use Node.js 20+.
2. Copy `.env.example` to `.env` and set `DUNGEON_WEBSITE_URL` and the shared `DUNGEON_SYNC_TOKEN` / website `BOT_SYNC_TOKEN`.
3. Install dependencies with `npm ci`.
4. Start with `npm start`; run tests with `npm test`.

Never commit `.env`, WhatsApp auth credentials, or Supabase service-role keys.

## Audit report
See [`docs/STAGE-17-AUDIT.md`](docs/STAGE-17-AUDIT.md). Current tests cover plugin registration and source contracts. Live WhatsApp group actions and live Supabase behavior require a deployment test.

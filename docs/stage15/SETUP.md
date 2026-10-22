# Stage 15 Setup

## Bot
1. Back up the bot directory and merge this ZIP only into the bot project.
2. Run `npm ci`, then `npm test`.
3. Configure `OPENAI_API_KEYS` and/or `GEMINI_API_KEYS` as a JSON array (`["key-a","key-b"]`) or comma-separated list. Never commit secrets.
4. Test `.menu`, `.setmenu`, `.profile`, `.setpp`, `.charge`, `.ask`, `.vipgen`, `.captiongen`, `.promptgen`, `.premiumask`, and `.premiumboost`.

## Web
1. Back up the Next.js project and merge the web ZIP only into the frontend project.
2. Run `npm install`, `npm run verify:stage15`, then `npm run build`.
3. Test water, Spirit Seed, patrol monsters, joystick and camera bounds on real target phones.

The worker is a lightweight heuristic, not sentience or a measurement of actual CPU/token cost. JSON ledgers are not distributed locks for multiple replicas.

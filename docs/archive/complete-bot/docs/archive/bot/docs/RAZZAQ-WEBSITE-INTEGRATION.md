# Razzaq Ventures Website Integration

This bot integration sends owner-authorized updates and records to the Razzaq Ventures Next.js website API.

## What is connected

- `src/services/razzaqWebsite.js`: server-side HTTP client for the health, integrations, and analytics endpoints.
- `src/plugins/owner/website.js`: owner-only WhatsApp commands.
- The current integration route uses `writeRecord` to persist validated events to the Supabase `rv_records` table when the production API and database are configured correctly. Verify this in Vercel logs and Supabase before relying on records.
- This integration does not expose Supabase credentials to the bot and does not execute arbitrary remote commands.

## Configure the website

In the Vercel project for `razzaq-ventures-platform`, configure these server-side environment variables:

- `INTEGRATION_API_TOKEN`: a long, random secret used to authenticate bot requests.
- `SUPABASE_URL`: the Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: the current server-side Supabase service-role/secret key required by the website's storage code.

Use a freshly rotated Supabase secret if a key was ever shared or committed. Never use a `NEXT_PUBLIC_` prefix for secrets. Redeploy the website after changing environment variables.

## Configure the bot

Set these variables in the bot host's secret/environment settings or in a local, untracked `.env` file:

```dotenv
WEBSITE_BASE_URL=https://razzaq-ventures-platform.vercel.app
WEBSITE_API_TOKEN=replace-with-the-same-random-token-as-INTEGRATION_API_TOKEN
WEBSITE_API_TIMEOUT_MS=8000
```

`WEBSITE_API_TOKEN` must match the website's `INTEGRATION_API_TOKEN`. It is **not** the Supabase key. The bot does not need `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`.

Keep `.env`, WhatsApp `sessions/`, and all credentials out of GitHub. Commit `.env.example`, not `.env`. After changing configuration, restart the bot.

## Owner-only WhatsApp commands

- `.webstatus` — check the website health endpoint.
- `.webset key | value` — update an allowed public content field.
- `.websale {"product":"LUMÓRA Lavender","quantity":2,"unitPrice":59900,"unitCost":25000,"channel":"Shopee"}` — record a sale.
- `.webexpense {"category":"Packaging","description":"Kotak produk","amount":45000}` — record an expense.
- `.webproduct {"sku":"LUM-LAV-85","name":"LUMÓRA Lavender","stock":10,"price":59900,"public":true}` — update product data.
- `.webreport` — read the website analytics summary.
- `.webpush event.name {"key":"value"}` — send an advanced event; the website still validates the event type and payload.
- `.webhelp` — show the command guide.

Aliases: `.rvstatus`, `.rvset`, `.rvsale`, `.rvexpense`, `.rvproduct`, `.rvreport`, `.rvpush`, `.rvhelp`.

Allowed content keys include `heroTitle`, `heroIntro`, `ceoName`, `ceoTitle`, `announcement`, `accentColor`, and `showAnnouncement`. The website remains the authority for validating event schemas and permitted fields.

## Verify end to end

1. Start the bot and send `.webstatus` from an owner account.
2. Send a small, safe test event using `.webpush audit.note {"message":"Tes koneksi integrasi dari bot"}`.
3. Check the Vercel logs and the Supabase `rv_records` table for the new record.
4. Test `.webset` and `.webreport` only after the basic connection succeeds.

A successful syntax check does not prove the bot is connected to production. Confirm persistence in Supabase before relying on these commands for business records.

## Security notes

- Never commit `.env`, session credentials, API tokens, or Supabase service-role keys.
- Do not upload WhatsApp `sessions/` data.
- Use a long, random `INTEGRATION_API_TOKEN` and keep it private.
- Treat event payloads as untrusted data. Do not add arbitrary remote command execution.


## Visitor analytics boundary

The owner analytics endpoint currently summarizes recorded sales and expenses; it is not a page-view counter. Website visitor-hit tracking must be implemented in `razzaq-ventures-platform` itself. Do not write raw IP addresses, cookies, session IDs, or full user-agent strings into this bot repository. Prefer privacy-aware daily aggregates stored in the website's database and expose them through a separately validated API if needed. The GitHub workflow in this bot tracks source updates only, not website visitors.


## Whiskay RPG Next.js companion update
Set `DUNGEON_WEBSITE_URL=https://whiskay-rpg-companion.vercel.app` and `DUNGEON_SYNC_TOKEN` in the bot environment. The website must be deployed from the supplied Next.js project root. Dungeon buttons use `/dungeon?floor=N&player=<opaque-id>` and profile/inventory buttons use `/inventory?player=<opaque-id>`. The website `/api/sync` accepts only authenticated bot snapshots; set the same `BOT_SYNC_TOKEN` in Vercel. The website floor data and bot `data/dungeon/floors.json` must remain identical (10 floors). Do not overwrite the real `.env` when updating the bot.


## WHISKAY RPG sync (separate bot-side code)

The RPG sync command belongs to this bot repository at `src/plugins/games/rpg-sync.js`.
It follows this project's native plugin contract (`name`, `command`, `execute(ctx)`), not a
generic Baileys `handler(m, { conn })` signature.

- RPG plugins push snapshots to the companion website's `POST /api/sync` through
  `src/services/dungeonWebsiteSync.js`, using an opaque SHA-256-derived player ID.
- `.rpgsync` checks the matching snapshot through the website's `GET /api/player?player=...`
  endpoint and prints a dashboard link.
- Configure `DUNGEON_WEBSITE_URL` and `DUNGEON_SYNC_TOKEN` in the bot host; configure
  `BOT_SYNC_TOKEN` and Supabase server-side credentials in the companion website.
- Keep the bot and website as separate repositories/deployments. Do not copy bot plugins
  into the website repository. Never distribute `.env` or `.env.local`.

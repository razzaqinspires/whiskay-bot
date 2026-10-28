# Stage 9 — RPG Economy

Commands: `.gacha`, `.craft potion`, `.trade @user gold 100`, `.trade @user potion-small 1`.

Set `DUNGEON_WEBSITE_URL` and `DUNGEON_SYNC_TOKEN` in the bot environment. The token must match the website `BOT_SYNC_TOKEN`.

Trade requires a group and a real WhatsApp mention. Player IDs are scoped to the current group using the existing `dashboardPlayerId(chat, jid)` contract; the recipient must have an RPG snapshot for that group first. Never use this feature as a substitute for a verified WhatsApp identity mapping across groups.

Gacha costs 100 Gold. Drop rates: Common 70%, Rare 25%, Epic 5%. Craft recipe: 2 `material-herb` + 1 `ashen-core` => 1 `potion-small`. Monsters must award these exact material IDs in their server-authoritative loot path.

Run `npm test`.

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

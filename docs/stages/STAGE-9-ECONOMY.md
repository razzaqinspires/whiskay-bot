# Stage 9 — RPG Economy (Bot)

Added native Whiskay command plugins:
- `.gacha` and `.gacha rates` — server-side equipment gacha, 100 Gold per pull.
- `.craft potion` — consumes 2 Herb + 1 Ashen Core through the website API.
- `.trade @user gold 100` or `.trade @user potion-small 1` — group-only transfer.

Legacy spirit gacha is retained as `.spiritgacha` so the new equipment gacha does not collide with the older plugin. The website must have the Stage 9 API/schema deployed first.

Set `DUNGEON_WEBSITE_URL` and `DUNGEON_SYNC_TOKEN` (same secret as website `BOT_SYNC_TOKEN`).

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](../STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](../README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

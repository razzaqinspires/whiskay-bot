# Stage 43 Iteration 1 — Canvas Refresh and Leveling Durability

## Menu Canvas
- Replaced the former shared-looking menu artwork with two independent 1200×675 landscape designs.
- V1 is a restrained classic/gold official edition; V2 is a modern command-center layout with a dedicated circular identity/avatar frame.
- V2 supports a per-user custom avatar/logo. From `.setmenu image`, select **Ganti Avatar / Logo V2**. Press **Unggah Avatar Canvas V2**, then reply to that exact bot message with a JPG/PNG/WEBP image. The image is applied automatically; no caption or follow-up command is required. Upload prompt expires after 15 minutes and is scoped to the sender.
- Avatar upload is limited to 8 MB. The saved file is stored in `data/menu-images/` and menu settings store its absolute path.

## Leveling storage
- The default data directory is now resolved relative to the project root rather than the shell's current working directory. A relative `WHISKAY_DATA_DIR` is also resolved relative to the project root. This prevents `npm start` from different working directories from silently creating a new XP database.
- Leveling snapshots use atomic temporary-file replacement, fsync, a previous-generation `.bak`, cross-process lock files, schema validation, and quarantine of a corrupt primary file.
- Read recovery tries primary, backup, then the newest checksum-verified gzip archive. A damaged primary is preserved as `leveling.json.corrupt-<timestamp>` instead of being silently treated as an empty database.
- When the active leveling JSON reaches 1 GiB (configurable using `WHISKAY_DB_ARCHIVE_BYTES`), a compressed dated snapshot and SHA-256 sidecar are stored in `data/archives/leveling/`. A maximum of one snapshot per day avoids recompressing a large file on every XP award.
- `.leveldb status` displays the storage state; owner-only `.leveldb restore` restores the latest valid backup/archive.

## Important archive semantics
The current Stage 43 archive is a **verified recovery snapshot**, not cold-storage sharding. The live `leveling.json` remains intact and directly queryable; no user records are removed from the active database. This avoids breaking leaderboard/profile lookups and avoids decompressing a 1 GiB file on every player lookup. True per-user cold-tier offloading requires a database migration and indexed archive manifests; it is not claimed as implemented here.

## Validation
- Stage 43 regression tests cover process restart persistence, backup recovery after primary corruption, checksum-verified archive recovery when both live copies are damaged, the configurable archive threshold, reply-only avatar application, and distinct valid PNG output for Canvas V1/V2.
- Live WhatsApp upload interaction and production-host disk durability still require deployment testing.

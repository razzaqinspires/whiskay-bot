# Tahap 16 — Guild dan AI Short-Term Memory

## Guild
`src/plugins/games/rpg-guild.js` menyediakan `.guild create <nama>` (10.000 Gold), `.guild join <ID>`, `.guild kick @anggota` (leader only), `.guild donate <Gold>`, dan `.guild info`. Terapkan `schema.sql` ke Supabase untuk tabel `rpg_guilds`, `rpg_guild_members`, serta RPC transaksi. Endpoint `/api/player/guild` memakai token bot dan service-role key hanya di server.

## AI memory
`src/cognitive/short-term-memory.js` menyimpan maksimal 8 pesan terakhir per sender di RAM, maksimal 2.000 sesi. Memori hilang saat proses restart; modul ini tidak menulis isi percakapan ke disk.

## Validasi
Jalankan `npm test`. Tes unit tidak menggantikan pengujian dengan Supabase dan WhatsApp aktif.

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

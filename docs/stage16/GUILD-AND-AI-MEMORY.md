# Tahap 16 — Guild & Short-Term AI Memory

## Guild commands
- `.guild create <nama>` — biaya 10.000 Gold; ID guild dikembalikan saat dibuat.
- `.guild join <ID_GUILD>` — bergabung bila belum menjadi anggota guild lain.
- `.guild kick @anggota` — hanya leader, dan hanya di grup dengan mention yang valid.
- `.guild donate <Gold>` — transfer Gold ke treasury guild.
- `.guild info` — nama, ID, level, treasury, dan jumlah anggota.

Jalankan `schema.sql` terbaru pada Supabase sebelum deploy route `/api/player/guild`. Route memerlukan `BOT_SYNC_TOKEN` atau `DUNGEON_SYNC_TOKEN` yang sama dengan token bot dan `SUPABASE_URL` serta `SUPABASE_SERVICE_ROLE_KEY` di server. Jangan pernah menaruh service-role key di frontend.

## AI memory
`src/cognitive/short-term-memory.js` menyimpan hingga 8 pesan terakhir per sender di memori proses. Batas 2.000 sesi; saat batas penuh, sesi tertua dikeluarkan. Memori ini hilang saat restart dan tidak menyimpan percakapan ke disk. Pengguna yang ingin menghapus konteks harus restart bot atau gunakan helper clearConversation dari kode.

## Catatan identitas
Player ID adalah hash opak yang diturunkan dari chat dan sender; raw JID tidak dikirim ke tabel guild. Dalam grup, kick menghitung ID target memakai ID grup yang sama.

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](../STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](../README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

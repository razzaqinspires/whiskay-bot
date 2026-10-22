# Tahap 16 — Guild dan AI Short-Term Memory

## Guild
`src/plugins/games/rpg-guild.js` menyediakan `.guild create <nama>` (10.000 Gold), `.guild join <ID>`, `.guild kick @anggota` (leader only), `.guild donate <Gold>`, dan `.guild info`. Terapkan `schema.sql` ke Supabase untuk tabel `rpg_guilds`, `rpg_guild_members`, serta RPC transaksi. Endpoint `/api/player/guild` memakai token bot dan service-role key hanya di server.

## AI memory
`src/cognitive/short-term-memory.js` menyimpan maksimal 8 pesan terakhir per sender di RAM, maksimal 2.000 sesi. Memori hilang saat proses restart; modul ini tidak menulis isi percakapan ke disk.

## Validasi
Jalankan `npm test`. Tes unit tidak menggantikan pengujian dengan Supabase dan WhatsApp aktif.

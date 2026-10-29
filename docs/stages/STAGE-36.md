# Stage 36 — Revisi berdasarkan analisis ZIP Experimental-Bell

Tanggal: 2026-10-29. Versi Whiskay Bot: 2.23.0.

## Sasaran
Melanjutkan Stage 36 sebelumnya tanpa mengubah nomor stage: menganalisis arsip `Experimental-Bell-master.zip` yang diunggah pengguna, memetakan helper/Events yang belum setara, serta menambahkan Werewolf multiplayer sebagai gap yang nyata.

## Perubahan aktual
- `src/lib/werewolf-engine.js`: state machine terisolasi untuk room, lobby, role randomization, validasi pemain, voting, aksi malam, resolusi fase dan kemenangan.
- `src/lib/werewolf-store.js`: simpan room ke `app-database.json` dengan `mutateAppDatabase` agar tetap berada pada jalur penulisan serial.
- `src/plugins/games/werewolf.js`: command `.ww` untuk create/join/start/player/status/vote/resolve-night/resolve-day/leave/delete/guide.
- `src/plugins/games/werewolf-private.js`: command `.wwpc` untuk skill malam.
- `src/lib/app-database.js`: default/migration additive untuk `werewolfRooms`; data lama tetap dipertahankan.
- `docs/stages/STAGE-36-SOURCE-AUDIT.md`: audit aktual berbasis sumber, termasuk command family matrix, helper responsibilities, gap prioritas, serta command literal yang diekstrak secara heuristik.
- `docs/stages/STAGE-36-LITERASI-1-5.md`: 250 subkategori dengan status aktual yang membedakan ADA, BARU—MVP, dan AUDIT.
- `NOTICE-THIRD-PARTY.md`, README dan CHANGELOG diperbarui.

## Analisis gap aktual
Whiskay sudah mempunyai catur, tic-tac-toe, slot, truth/dare, pet dan RPG plugins. Namun `src/plugins` sebelum revisi tidak memiliki Werewolf. Sumber Experimental-Bell memisahkan command orchestration `helpers/Events/werewolf.js` dari rules engine `machine/werewolf.js`; keduanya telah dipelajari, bukan sekadar menilai dari nama berkas.

## Status parity jujur
`EXISTING`: kemampuan sumber yang mempunyai fitur serupa pada Whiskay.
`PARTIAL`: domain tersedia, tetapi command/provider/edge case belum setara.
`MISSING`: belum ditemukan di baseline.
`BARU—MVP`: implementasi baru sekarang namun belum seluruh parity sumber.
`AUDIT`: perlu pembandingan per command dan pengujian lebih lanjut.

Stage 36 tidak menyalin keseluruhan source file besar ke Whiskay. Ia meremake fondasi/logic yang relevan dengan adapter dan data model Whiskay. Lisensi sumber MIT dan attribution notice dicatat. Bukan berarti semua perintah sudah identik.

## Werewolf — fitur dan batasan
- Room maksimal 15 pemain, minimal 5, join/leave di lobby, role assignment, room persistens, public state tidak memublikasikan role.
- Role awal: werewolf, villager, seer, guardian, witch, hunter, sorcerer, traitor, lycan. Voting siang dan resolusi malam/siang tersedia.
- Fase masih diproses host melalui `.ww resolve-night` / `.ww resolve-day`; timer otomatis belum ditambahkan.
- Private command `.wwpc` saat ini memerlukan room ID sebagai argumen ketiga agar dapat menemukan room grup dari DM; UX binding otomatis belum selesai.
- Mayor vote weighting belum dikerjakan; trigger Hunter setelah mati belum dihubungkan; pembatasan witch potion dan traitor/lycan edge case masih perlu dites seutuhnya.
- Tidak ada klaim tes WhatsApp live atau keseluruhan parity Werewolf.

## Testing
`npm run verify:stage36` menjalankan pengujian registry dan Werewolf engine. Tes unit memeriksa lobby, batas pemain, role privacy, phase guard, voting dan protection. Tes ini tidak membuktikan interaksi WhatsApp live, pengiriman semua DM, atau phase timers.

## Prioritas setelah Stage 36
1. Lengkapi private room lookup `.wwpc` agar room binding otomatis aman.
2. Tambah timer siang/malam yang disimpan/dipulihkan dengan batas concurrent action dan expiry.
3. Lengkapi Mayor, Hunter, Witch, Traitor dan Lycan dengan test table-driven.
4. Buat source-command mapping memakai static/AST extraction dan compare ke seluruh `PluginManager` commands/aliases Whiskay.
5. Remake feature families berikut berdasarkan hasil gap: converter/TTS, game lainnya, miscellaneous/owner, relationship, search/tools, dan helper Jadibot/reaction/stub messages.
6. Setiap fitur hanya boleh berstatus complete setelah tests dan compatibility checks mendukung.

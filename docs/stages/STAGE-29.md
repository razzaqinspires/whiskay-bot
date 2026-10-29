# Stage 29 — Menu Studio, Contextual Explore, Canvas Controls & RPG Integration

**Release:** 2.15.0 · **Date:** 2026-10-29

## Literasi 1–5 (masing-masing tepat lima kategori)

1. **Menu & desain global**
   1. Template tambahan: Kawaii, Boxed, Japanese, Developer/Terminal.
   2. Simbol widget sebagai lapisan terpisah dari template.
   3. Pengaturan widget, font, urutan, border, spasi dan ketebalan.
   4. Ringkasan konfigurasi yang menampilkan nilai tersimpan.
   5. Reset konfigurasi menu per pengguna.
2. **Profil, status, dan kanvas**
   1. Koin Mod ditampilkan terpisah dari coin RPG.
   2. Status runtime diperluas dengan memory, PID, uptime, OS, limit dan ekonomi.
   3. Menu Canvas V1/V2 serta pemilih sumber avatar Face/Logo.
   4. Profile canvas V1/V2 dipilih dari `.profile image`.
   5. Tombol cepat untuk mengganti kanvas dan kembali ke profil.
3. **Quoted message & serializer**
   1. Fake contact dengan nama/nomor contoh yang dapat disetel.
   2. Fake product dengan nama/harga contoh yang dapat disetel.
   3. Label forwarded `full`, `short`, atau `off` melalui konfigurasi menu.
   4. Fake quote lain tetap diberi label synthetic preview, bukan identitas pihak ketiga.
   5. Kompatibilitas serializer diperiksa dengan tes sintaks dan tes Stage 29.
4. **Rekomendasi & explore**
   1. Tombol rekomendasi dapat dinonaktifkan per pengguna.
   2. Owner dapat mengontrol rekomendasi global dengan `.recommendation on|off|status`.
   3. `.explore stats` menampilkan statistik pemakaian dan top-10 dari data pengguna yang tersedia.
   4. Filter metadata owner, group/private, premium dan limit diterapkan jika plugin mendeklarasikannya.
   5. Persentase adalah bagian dari penggunaan yang tercatat, bukan probabilitas keberhasilan.
5. **Open world, dungeon, dan website**
   1. Copy portal menegaskan dungeon merupakan bagian dari perjalanan open world.
   2. Navigasi utama hanya menampilkan Open World dan Inventory sebagai area game utama.
   3. Adventure tetap memerlukan token akses sah dari alur WhatsApp.
   4. Inventory tetap memerlukan token akses sah dari alur WhatsApp.
   5. Dungeon gameplay tetap menggunakan sistem game yang tersedia; penggabungan server-side penuh harus diverifikasi terpisah.

## Literasi 6 — fitur tambahan (lima kategori)

1. GitHub command dipertahankan dan dipakai sebagai gaya integrasi Whiskay.
2. `.imagine` memakai OpenAI Images API bila `OPENAI_API_KEY` tersedia; tanpa key, bot menjelaskan konfigurasi yang kurang.
3. `.character` membuat konsep karakter RPG lokal deterministik; tidak mengklaim menyimpan karakter ke database.
4. List Pengaturan Menu memiliki tiga opsi: pengaturan utama, desain berbantuan AI/struktur terkunci, dan mode respon menu.
5. README, changelog, arsip stage, skrip verifikasi dan laporan tes diperbarui.

## Perintah baru / diperluas

- `.setmenu summary` — konfigurasi menu lengkap.
- `.setmenu symbols` — pengaturan simbol global.
- `.setmenu symbols before <teks>` / `.setmenu symbols after <teks>`.
- `.setmenu symbols visible on|off` / `.setmenu symbols reset`.
- `.setmenu recommendations-toggle on|off` — preferensi per pengguna.
- `.recommendation on|off|status` — kontrol global owner.
- `.explore stats` / `.explorestats` / `.rekomendasi` — eksplorasi command dan statistik personal.
- `.imagine <prompt>` — generasi gambar via OpenAI Images API.
- `.character <ide>` — konsep karakter RPG.
- `.setmenu forwarded full|short|off` — mode metadata forwarded untuk pesan menu.
- `.setmenu quote contact-name <nama>`, `.setmenu quote contact-number <nomor>`, `.setmenu quote product-name <nama>`, `.setmenu quote product-price <harga>`.

## Serializer & keamanan

Dokumentasi resmi Baileys menegaskan pengiriman pesan melalui `sock.sendMessage(jid, content, options)` dan quoted message melalui opsi `quoted`. ID grup memiliki suffix `@g.us`. Stage ini menghindari menampilkan JID grup di dashboard baterai; entri grup/broadcast/newsletter dikecualikan dari daftar yang dicetak. Fake contact/product adalah demo sintetis, tidak boleh dipakai untuk menyamar sebagai orang atau bisnis nyata.

## Batasan yang diketahui

- Mode `AI` menyimpan pilihan renderer/konfigurasi dan mengunci struktur secara konseptual; integrasi provider AI untuk merancang ulang isi menu belum dianggap aktif hanya karena mode dipilih. Registry dan permission tetap menjadi sumber kebenaran.
- `.imagine` memerlukan API key yang sah, akses model, internet, dan kuota provider.
- `.character` saat ini menghasilkan konsep lokal, bukan sinkronisasi karakter baru ke database.
- Sumber avatar Face/Logo menggunakan `OWNER_AVATAR_PATH` atau `BOT_LOGO_PATH` bila tersedia; bila tidak, fallback kanvas tetap berfungsi.
- Filter `.explore` bergantung pada metadata plugin. Plugin yang tidak mendeklarasikan flag akses dengan benar perlu diaudit manual.
- Cache/idempotensi Stage 28 tetap in-memory; tidak berubah menjadi pemrosesan durable lintas restart pada Stage 29.
- Integrasi dungeon server-side dan pemindahan semua dungeon ke satu scene world memerlukan pengujian runtime/akun nyata; perubahan navigasi portal tidak membuktikan semua sistem dungeon sudah menyatu.

## Verifikasi

- `npm run verify:stage29`
- `npm run verify:all`
- `node --check` pada modul yang diubah.

Laporan hasil final ditempatkan pada `docs/stages/TEST-REPORT-STAGE-29.md` setelah pengujian penuh.

## References reviewed

- Baileys send/quote/forward documentation: https://github.com/WhiskeySockets/docs/blob/main/messaging/sending-messages.mdx
- Baileys README and JID conventions: https://github.com/WhiskeySockets/Baileys/blob/master/README.md
- Security advisory for spoofed `messages.upsert` / history sync (patched in 6.7.22 and 7.0.0-rc12): https://github.com/WhiskeySockets/Baileys/security/advisories/GHSA-qvv5-jq5g-4cgg
- Related forwarding metadata issue: https://github.com/WhiskeySockets/Baileys/issues/2544
- Feature inspiration URLs requested: https://github.com/mruniquehacker/Knightbot-MD/blob/main/commands/github.js ; https://github.com/mruniquehacker/Knightbot-MD/blob/main/commands/imagine.js ; https://github.com/mruniquehacker/Knightbot-MD/blob/main/commands/character.js

The three Knightbot files were used as feature targets/inspiration only; this implementation was adapted to WhiskayBot's plugin conventions rather than copying their response text verbatim.

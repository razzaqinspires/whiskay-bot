# Experimental-Bell → Whiskay Bot: Parity Audit & Transplant Record

## Tujuan

Penyempurnaan dilakukan berdasarkan perbandingan perilaku, bukan penyalinan mentah. Implementasi Whiskay yang lebih matang dipertahankan; hanya kekurangan yang dibuktikan lewat inventaris sumber dan plugin Whiskay yang ditambahkan atau diselaraskan. Satu nama command yang sama bukan bukti paritas penuh.

## Sumber yang diinventarisasi

Repo sumber: `Rifza123/Experimental-Bell`, branch `master`, diakses melalui GitHub connector pada 2026-10-29. Modul sumber yang dipindai: `about.js`, `ai.js`, `converter.js`, `downloader.js`, `game.js`, `group.js`, `maker.js`, `others.js`, `owner.js`, `relationship.js`, `rpg.js`, `search.js`, `tools.js`, `tts.js`, `werewolf.js`, `wwpc.js`, dan `reloadevents.js`.

## Hasil audit awal

| Keluarga sumber | Perintah/fungsi sumber yang teridentifikasi | Status di Whiskay pada audit ini | Tindakan |
|---|---|---|---|
| Game | Tebak gambar/bendera/anime, susun kata, tebak jenaka/lirik/tebakan, asah otak, hint, Cak Lontong, Family100, clear/nyerah, chess, SOS, Ular Tangga, cek, minigames | Kuis klasik sudah ada dari Iteration 1; Catur dan Werewolf telah ada; SOS/Ular Tangga/minigames perlu parity | Tambah SOS multiplayer, Ular Tangga multiplayer, dan index minigames dengan sesi tersimpan dan validasi langkah |
| Downloader | Pinterest, MediaFire, TikTok, Spotify, RedNote, YouTube, Facebook, Instagram, Git clone | Sebagian sudah memiliki plugin terpisah; alias dan setiap format perlu dicocokkan | Pertahankan plugin Whiskay yang ada, hindari mengganti dengan handler sumber mentah |
| Grup | Pengaturan grup, anggota, mention, absensi, antispam/antilink, welcome, jadwal, undangan, sewa, status energi | Banyak fungsi sejenis tersedia; paritas per command belum terbukti | Lanjut audit izin, efek samping, alias, dan menu per perintah |
| Owner | Pengaturan, database, energi/premium, ban, API key, backup, sesi, role, owner/co-owner, update, response, command, grup, tiket, pesan/channel | Banyak fungsi sejenis tersedia; tidak semua source behavior dipastikan | Prioritas keamanan akses dan verifikasi perintah mutatif sebelum mengadaptasi |
| AI/media generatif | Chat provider, model gambar, edit gambar, video, LoRA/checkpoint, face swap, musik AI | Whiskay memiliki AI chat dan generator tertentu; seluruh layanan sumber belum setara | Tandai gap per provider/endpoint; jangan mengklaim ada jika endpoint/API key belum tersedia |
| Converter | Konversi gambar/video/audio, efek audio, FFmpeg, PTV, 16D, merge/concat | Belum ada satu plugin yang membuktikan seluruh cakupan | Butuh audit dependensi native, batas ukuran, tipe MIME, dan ketersediaan FFmpeg sebelum porting |
| Maker | Sticker, watermark sticker, meme, quoted card, Brat, NGL, emoji mix, triggered | Sebagian fitur maker tersedia; paritas penuh belum terbukti | Reuse generator Whiskay dan tambahkan hanya generator yang tidak tersedia |
| Search/tools | Pinterest/GImages, Pinterest video, anime, lyrics, TikTok search, compress, remini, tmpfile, catbox, URL, image prompt, enhance, screenshot, audio recognition/transcription, channel ID, vocal removal, encrypt, remove-bg, object detection, color conversion, site key | Beragam plugin/tools ada, tetapi tidak seluruh endpoint dan alias terverifikasi | Perlu pemetaan endpoint + kebijakan ukuran/privasi, tanpa menyalin endpoint tidak stabil secara membabi buta |
| TTS | ElevenLabs dan Google TTS | Plugin khusus dan dependensi runtime belum dipastikan pada audit ini | Tidak mengklaim TTS selesai; perlu adapter provider, limit input, dan handling API key |
| Relasi/ekonomi | Profile/inventory, charge, mining, trial, confess, energy transfer, QRIS | Whiskay memiliki sistem akun/energi dan menfess; skema sumber berbeda | Jangan menyalin transaksi/ekonomi mentah karena dapat menggandakan saldo atau melewati ledger Whiskay |
| Werewolf | `ww` dan `wwpc` | Engine Werewolf sudah ada | Pertahankan engine, audit kompatibilitas command dan private-chat flow |
| Others | Menu, reaction menu, view-once, delete, stats/ping, total pesan, jadibot, source code | Sebagian besar memiliki padanan | Audit perilaku aktual dan izin; tidak cukup hanya alias |
| RPG | Registrasi, serial, shop, buy/sell, upgrade/repair, diskon, claim, craft, mining, hunting, fishing, heal, crate | Whiskay punya RPG dengan modul ekonomi/expansion terpisah | Cocokkan setiap mekanik; jangan membuat dua sumber kebenaran untuk saldo/inventory |
| Reload | `reloadevents` | Whiskay memakai hot reload/registry | Pertahankan loader Whiskay; jangan port mekanisme global sumber yang tidak sesuai |

## Perubahan pada rilis ini

- `src/plugins/games/sos.js`: sesi SOS multiplayer disimpan di database aplikasi, menerima/menolak tantangan, validasi giliran dan kotak, deteksi garis SOS horizontal/vertikal/diagonal, skor, seri, resign, serta timeout.
- `src/plugins/games/snake-ladders.js`: lobby Ular Tangga 2–4 pemain, giliran, dadu, ular/tangga, papan teks, penyimpanan sesi, timeout, stop dan pemenang. Hadiah tidak dikreditkan secara otomatis: teks hadiah adalah konfigurasi/indikasi saja sampai diintegrasikan dengan ledger Whiskay.
- `src/plugins/games/minigames.js`: daftar, pencarian, kategori, detail, dan tombol jalankan untuk game yang memang terdaftar di Whiskay. Tidak menciptakan tautan eksternal palsu.
- `test/parity-transplant.test.js`: pengujian alias, deteksi garis SOS, daftar minigames, dan kontrak plugin.

## Batas verifikasi

- Tes lokal tidak membuktikan konektivitas WhatsApp live, API eksternal, atau pengiriman media.
- Minigames eksternal yang tidak memiliki URL/API stabil belum dipalsukan sebagai tersedia.
- Audit sumber command adalah inventaris awal; status paritas penuh memerlukan pemeriksaan alur setiap command, dependensi, data, dan efek samping.
- Fitur yang sudah lebih baik di Whiskay tidak diganti hanya demi kemiripan dengan kode sumber.

# Whiskay Stage 32 — 250 Subkategori Kerja

Tanggal: 2026-10-29

> Status [Implementasi]/[Bug Fix]/[Upgrade] mengacu pada source yang diubah pada Stage 32. [Rencana] adalah pekerjaan lanjutan dan bukan klaim fitur selesai. Bukti test hanya berlaku untuk test yang disebutkan secara eksplisit.

Literasi 1: Fondasi, Bug Fix, Energi, dan Kualitas

  · Kategori 1.1 Audit bug dan bukti runtime: Audit bug dan bukti runtime
    · Subkategori runtime.1: [Bukti] Catat bahwa entrypoint serializer ialah `src/core/serializer.js` dan target kompatibilitas `src/core/serializer-compat.cjs`.
    · Subkategori runtime.2: [Bukti] Catat bahwa `serializer-compact.cjs` tidak ada di arsip Stage 31 yang diperiksa.
    · Subkategori runtime.3: [Bug Fix] Blok command berbiaya ketika energi awal tepat 0%.
    · Subkategori runtime.4: [Test] Tambahkan pemeriksaan kontrak energi nol dan command pemulihan.
    · Subkategori runtime.5: [Bug Fix] Pisahkan command pemulihan dari command berbiaya agar pengguna tetap bisa mengisi energi.
    · Subkategori runtime.6: [Test] Uji level energi 0, 0.01, dan nilai positif di atas biaya.
    · Subkategori runtime.7: [Dokumentasi] Tambahkan troubleshooting jika command dihentikan oleh energi habis.
    · Subkategori runtime.8: [Dokumentasi] Jelaskan bahwa kegagalan baca ledger masih fail-open.
    · Subkategori runtime.9: [Bukti] Simpan hasil `npm run verify:all` Stage 32.
    · Subkategori runtime.10: [Rencana] Tambah integration test menggunakan socket Baileys mock untuk blok energi nol.

  · Kategori 1.2 Desain widget dan simbol terpisah: Desain widget dan simbol terpisah
    · Subkategori terpisah.1: [Implementasi] Tambah `widgetDesign` sebagai setting terpisah dari `template`.
    · Subkategori terpisah.2: [Implementasi] Sediakan preset classic untuk widget tanpa dekorasi tambahan.
    · Subkategori terpisah.3: [Implementasi] Sediakan preset minimal dengan awalan titik.
    · Subkategori terpisah.4: [Implementasi] Sediakan preset cyberpunk dengan label sistem.
    · Subkategori terpisah.5: [Implementasi] Sediakan preset kawaii dengan separator lembut.
    · Subkategori terpisah.6: [Implementasi] Sediakan preset boxed dan elegant untuk isi widget.
    · Subkategori terpisah.7: [Bug Fix] Terapkan simbol before/after setelah desain widget dipilih, tanpa menimpa preset.
    · Subkategori terpisah.8: [Test] Pastikan perubahan widgetDesign tidak mengubah widgetSymbolBefore/After.
    · Subkategori terpisah.9: [Dokumentasi] Tambahkan command `.setmenu widgetdesign`.
    · Subkategori terpisah.10: [Bukti] Tambahkan pemeriksaan default widget design dan penyimpanan setting.

  · Kategori 1.3 Pengaturan menu dengan list dan konfirmasi: Pengaturan menu dengan list dan konfirmasi
    · Subkategori konfirmasi.1: [Bug Fix] Ubah respons pilihan forwarded agar kembali dengan tombol navigasi.
    · Subkategori konfirmasi.2: [Bug Fix] Ubah respons font baterai agar tetap memiliki tombol pengaturan.
    · Subkategori konfirmasi.3: [Bug Fix] Ubah respons notifikasi energi agar tidak kehilangan menu lanjutan.
    · Subkategori konfirmasi.4: [Implementasi] Gunakan single-select list untuk pengaturan sekunder.
    · Subkategori konfirmasi.5: [Implementasi] Batasi tombol quick-reply utama maksimal tiga pada alur Stage 32.
    · Subkategori konfirmasi.6: [Implementasi] Tampilkan ringkasan template, widget, simbol, dan desain widget.
    · Subkategori konfirmasi.7: [Test] Uji parse perintah pilihan list dengan argumen ber-spasi.
    · Subkategori konfirmasi.8: [Dokumentasi] Daftarkan seluruh pilihan `.setmenu`.
    · Subkategori konfirmasi.9: [Bukti] Simpan tes sintaks plugin setmenu.
    · Subkategori konfirmasi.10: [Rencana] Uji klik native-flow pada perangkat Android dan WhatsApp Web.

  · Kategori 1.4 Pagination dan widget informasi: Pagination dan widget informasi
    · Subkategori informasi.1: [Implementasi] Atur ukuran halaman command dari 100 sampai 500.
    · Subkategori informasi.2: [Implementasi] Matikan pagination saat mode unlimited dipilih.
    · Subkategori informasi.3: [Implementasi] Sediakan opsi info halaman berikutnya.
    · Subkategori informasi.4: [Bug Fix] Hapus nomor halaman dari widget hitung saat unlimited aktif.
    · Subkategori informasi.5: [Implementasi] Tambahkan saklar widget baterai pada menu.
    · Subkategori informasi.6: [Implementasi] Tambahkan widget Coin Mod dari energy ledger.
    · Subkategori informasi.7: [Implementasi] Tambahkan Top Rank maksimum tiga entri.
    · Subkategori informasi.8: [Implementasi] Tambahkan Top Level maksimum tiga entri.
    · Subkategori informasi.9: [Test] Periksa batas page size 100 dan 500.
    · Subkategori informasi.10: [Dokumentasi] Jelaskan risiko panjang pesan saat pagination dimatikan.

  · Kategori 1.5 Persistensi, regresi, dan rollback: Persistensi, regresi, dan rollback
    · Subkategori rollback.1: [Bug Fix] Serialisasi update profil dan XP untuk mencegah lost update dalam satu proses.
    · Subkategori rollback.2: [Test] Jalankan 40 award XP paralel dan pastikan semua poin tercatat.
    · Subkategori rollback.3: [Implementasi] Tambahkan `WHISKAY_DATA_DIR` agar tes dapat memakai direktori terisolasi.
    · Subkategori rollback.4: [Dokumentasi] Catat bahwa lock lokal tidak menjamin transaksi multi-instance.
    · Subkategori rollback.5: [Test] Jalankan tes Stage 29 sampai Stage 32.
    · Subkategori rollback.6: [Dokumentasi] Tambahkan prosedur backup `leveling.json`.
    · Subkategori rollback.7: [Dokumentasi] Tambahkan prosedur rollback ke source Stage 31.
    · Subkategori rollback.8: [Bukti] Catat file baru `test/stage32-regression.test.js`.
    · Subkategori rollback.9: [Bukti] Catat hasil empat tes Stage 32 lulus.
    · Subkategori rollback.10: [Rencana] Tambahkan crash recovery test untuk file JSON terpotong.

Literasi 2: Monetisasi dan Fitur Penghasil Uang Asli

  · Kategori 2.1 Model bisnis dan batas produk: Model bisnis dan batas produk
    · Subkategori produk.1: [Dokumentasi] Tegaskan Coin Mod adalah saldo virtual, bukan uang fiat.
    · Subkategori produk.2: [Rencana] Definisikan paket subscription Premium bulanan dan manfaat yang terukur.
    · Subkategori produk.3: [Rencana] Tetapkan pricing dan pajak sebelum checkout live.
    · Subkategori produk.4: [Dokumentasi] Pisahkan Coin Mod, Gold RPG, saldo Rupiah, dan XP dalam README.
    · Subkategori produk.5: [Rencana] Tentukan target pengguna untuk bot tools dan RPG companion.
    · Subkategori produk.6: [Rencana] Buat metrik conversion, refund, churn, dan pendapatan bersih.
    · Subkategori produk.7: [Dokumentasi] Tambahkan Terms of Service dan kebijakan refund sebagai prasyarat.
    · Subkategori produk.8: [Rencana] Validasi ketentuan penyedia payment gateway di Indonesia.
    · Subkategori produk.9: [Test] Tambahkan skenario harga invalid dan nominal negatif.
    · Subkategori produk.10: [Bukti] Catat bahwa tidak ada payment gateway live pada Stage 32.

  · Kategori 2.2 Payment gateway dan webhook: Payment gateway dan webhook
    · Subkategori webhook.1: [Rencana] Pilih gateway setelah membandingkan biaya dan dukungan webhook.
    · Subkategori webhook.2: [Rencana] Buat endpoint create-invoice dengan ID transaksi unik.
    · Subkategori webhook.3: [Rencana] Validasi signature webhook menggunakan secret server-side.
    · Subkategori webhook.4: [Rencana] Tolak callback tanpa signature valid.
    · Subkategori webhook.5: [Rencana] Idempotensi webhook agar satu invoice hanya mengkredit satu kali.
    · Subkategori webhook.6: [Rencana] Simpan status pending, paid, expired, failed, dan refunded.
    · Subkategori webhook.7: [Test] Buat sandbox test callback berulang dan callback tidak valid.
    · Subkategori webhook.8: [Dokumentasi] Pisahkan konfigurasi sandbox dari produksi.
    · Subkategori webhook.9: [Dokumentasi] Larang memasukkan payment secret ke ZIP source.
    · Subkategori webhook.10: [Bukti] Tandai semua butir sebagai rencana sampai sandbox evidence tersedia.

  · Kategori 2.3 Subscription Premium dan akses: Subscription Premium dan akses
    · Subkategori akses.1: [Upgrade] Pertahankan `.premium` sebagai tindakan owner dengan batas hari.
    · Subkategori akses.2: [Rencana] Tambah subscription ledger yang menyimpan awal, akhir, dan status.
    · Subkategori akses.3: [Rencana] Perpanjangan subscription dilakukan lewat event pembayaran tervalidasi.
    · Subkategori akses.4: [Rencana] Tambahkan masa tenggang setelah invoice gagal diperpanjang.
    · Subkategori akses.5: [Test] Uji premium expired pada batas waktu tepat.
    · Subkategori akses.6: [Rencana] Buat perintah `.premium status` untuk pengguna.
    · Subkategori akses.7: [Dokumentasi] Jelaskan Premium tidak sama dengan Mod Coin.
    · Subkategori akses.8: [Rencana] Buat audit perubahan hak premium.
    · Subkategori akses.9: [Test] Pastikan webhook ganda tidak menambah masa Premium dua kali.
    · Subkategori akses.10: [Bukti] Jangan klaim auto-subscription aktif sebelum endpoint dan test tersedia.

  · Kategori 2.4 Iklan, affiliate, donasi, produk digital: Iklan, affiliate, donasi, produk digital
    · Subkategori digital.1: [Rencana] Tambah reward ads hanya melalui provider yang mendukung callback terverifikasi.
    · Subkategori digital.2: [Rencana] Cegah reward ads diklaim berulang memakai idempotency key.
    · Subkategori digital.3: [Rencana] Buat link affiliate dengan disclosure dan parameter kampanye.
    · Subkategori digital.4: [Dokumentasi] Cantumkan label affiliate pada rekomendasi berbayar.
    · Subkategori digital.5: [Rencana] Tambahkan endpoint donasi dengan status invoice.
    · Subkategori digital.6: [Rencana] Buat katalog produk digital dengan SKU, harga, dan status ketersediaan.
    · Subkategori digital.7: [Test] Tolak URL produk dan harga yang tidak valid.
    · Subkategori digital.8: [Dokumentasi] Jelaskan bahwa reward virtual tidak otomatis bisa ditukar uang.
    · Subkategori digital.9: [Rencana] Buat dashboard revenue tanpa menampilkan data pribadi pengguna.
    · Subkategori digital.10: [Bukti] Tandai ads/referral/donasi sebagai belum aktif di Stage 32.

  · Kategori 2.5 Coin Mod, energi, dan ekonomi: Coin Mod, energi, dan ekonomi
    · Subkategori ekonomi.1: [Implementasi] Tampilkan saldo Coin Mod lewat `.modcoin` tanpa argumen.
    · Subkategori ekonomi.2: [Implementasi] Tambahkan tombol riwayat transaksi dari menu Coin Mod.
    · Subkategori ekonomi.3: [Upgrade] Pertahankan riwayat transaksi maksimum 100 entri per akun.
    · Subkategori ekonomi.4: [Dokumentasi] Jelaskan debit Fast Charge dan biaya upgrade kapasitas.
    · Subkategori ekonomi.5: [Test] Uji saldo tidak cukup tidak mengurangi Coin Mod.
    · Subkategori ekonomi.6: [Rencana] Migrasikan ledger ke DB dengan transaksi atomik.
    · Subkategori ekonomi.7: [Rencana] Gunakan reference ID invoice untuk kredit pembayaran.
    · Subkategori ekonomi.8: [Dokumentasi] Jelaskan konsumsi energi bukan transaksi uang asli.
    · Subkategori ekonomi.9: [Test] Uji pembelian gagal tidak memberi Coin Mod.
    · Subkategori ekonomi.10: [Bukti] Catat keterbatasan JSON ledger satu proses.

Literasi 3: RPG Bot, Website, Leveling, dan Kanvas

  · Kategori 3.1 Leveling dan progres pemain: Leveling dan progres pemain
    · Subkategori pemain.1: [Bug Fix] Serialisasi penambahan XP agar pesan paralel tidak saling menimpa.
    · Subkategori pemain.2: [Test] Pastikan 40 pesan paralel menaikkan points sebanyak 40.
    · Subkategori pemain.3: [Upgrade] Pertahankan XP sebagai satu-satunya input kenaikan level.
    · Subkategori pemain.4: [Dokumentasi] Jelaskan leveling grup perlu diaktifkan melalui `.leveling on`.
    · Subkategori pemain.5: [Test] Uji XP tidak bertambah ketika leveling grup OFF.
    · Subkategori pemain.6: [Upgrade] Simpan audit event level-up dengan level awal dan akhir.
    · Subkategori pemain.7: [Rencana] Tambahkan unique event ID untuk deduplikasi award XP.
    · Subkategori pemain.8: [Rencana] Pindahkan progres ke transaksi database.
    · Subkategori pemain.9: [Dokumentasi] Jelaskan data dipisah per `group|user`.
    · Subkategori pemain.10: [Bukti] Lampirkan tes concurrency Stage 32.

  · Kategori 3.2 Profile card dan widget pengguna: Profile card dan widget pengguna
    · Subkategori pengguna.1: [Implementasi] Tambahkan `.profile widgets` untuk kontrol komponen kartu profil.
    · Subkategori pengguna.2: [Implementasi] Tambahkan saklar User Profile Card.
    · Subkategori pengguna.3: [Implementasi] Tambahkan saklar Progress Card.
    · Subkategori pengguna.4: [Implementasi] Tambahkan saklar Economy Card.
    · Subkategori pengguna.5: [Implementasi] Tambahkan saklar Familiarity & Role.
    · Subkategori pengguna.6: [Implementasi] Tambahkan saklar Premium Card.
    · Subkategori pengguna.7: [Implementasi] Tambahkan saklar Smart Energy dan Coin Mod.
    · Subkategori pengguna.8: [Upgrade] Tambahkan list pengaturan profil pada profile card.
    · Subkategori pengguna.9: [Test] Pastikan widget profile tidak bergantung pada widget menu utama.
    · Subkategori pengguna.10: [Dokumentasi] Catat gambar profil disimpan berdasarkan chat dan user.

  · Kategori 3.3 Kanvas menu dan status: Kanvas menu dan status
    · Subkategori status.1: [Upgrade] Simpan `statusCanvasMode` per user.
    · Subkategori status.2: [Upgrade] Pertahankan pilihan kanvas status landscape V1/V2.
    · Subkategori status.3: [Upgrade] Gunakan global baseline sebagai fallback kanvas status.
    · Subkategori status.4: [Upgrade] Pertahankan kanvas menu V1/V2 terpisah dari profile canvas.
    · Subkategori status.5: [Test] Uji pilihan V1/V2 tidak mengubah level dan XP.
    · Subkategori status.6: [Dokumentasi] Jelaskan URL avatar owner adalah opsional untuk fallback canvas.
    · Subkategori status.7: [Bug Fix] Pastikan tombol Ganti Canvas tetap tersedia pada status owner.
    · Subkategori status.8: [Test] Uji fallback status ketika gambar owner tidak tersedia.
    · Subkategori status.9: [Rencana] Tambahkan golden-image test untuk hasil canvas.
    · Subkategori status.10: [Bukti] Catat bahwa hasil render perlu diuji pada host produksi.

  · Kategori 3.4 Inventory, dungeon, dan sinkronisasi web: Inventory, dungeon, dan sinkronisasi web
    · Subkategori web.1: [QA] Pertahankan validasi access token pada player update route.
    · Subkategori web.2: [QA] Pertahankan batas integer pada level, HP, gold, dan floor.
    · Subkategori web.3: [QA] Pertahankan validasi koordinat dunia finite dan bounded.
    · Subkategori web.4: [QA] Pertahankan batas 200 item inventory per request.
    · Subkategori web.5: [Dokumentasi] Jelaskan route web tidak diubah pada Stage 32 karena temuan utama bot-side.
    · Subkategori web.6: [Rencana] Tambahkan contract test sinkronisasi inventory bot-ke-web.
    · Subkategori web.7: [Rencana] Tambahkan deduplikasi transaksi gold/coin pada API.
    · Subkategori web.8: [Rencana] Uji dungeon reward tidak diberikan dua kali setelah retry.
    · Subkategori web.9: [Test] Jalankan `npm run verify:stage32` pada RPG companion.
    · Subkategori web.10: [Bukti] Simpan output QA kontrak akses player.

  · Kategori 3.5 Open World, economy, dan QA RPG: Open World, economy, dan QA RPG
    · Subkategori RPG.1: [Rencana] Satukan progress dungeon dan Open World dalam player snapshot.
    · Subkategori RPG.2: [Rencana] Tambahkan validasi server-side untuk checkpoint dan completedFloors.
    · Subkategori RPG.3: [Rencana] Batasi item inventory dan ukuran payload JSON.
    · Subkategori RPG.4: [Upgrade] Pertahankan akses Inventory di belakang token player.
    · Subkategori RPG.5: [Test] Uji token pemain A tidak dapat memperbarui player B.
    · Subkategori RPG.6: [Rencana] Tambahkan test rollback saat write database gagal.
    · Subkategori RPG.7: [Dokumentasi] Pisahkan Coin Mod bot dari Gold RPG website.
    · Subkategori RPG.8: [Rencana] Buat migrasi skema untuk histori reward dungeon.
    · Subkategori RPG.9: [Test] Uji reward idempotent setelah reconnect.
    · Subkategori RPG.10: [Bukti] Jangan klaim integrasi gameplay persisten sebelum test end-to-end.

Literasi 4: Command Baru, UX, dan Otomasi

  · Kategori 4.1 Navigasi setmenu dan command: Navigasi setmenu dan command
    · Subkategori command.1: [Upgrade] Jadikan `.setmenu` sebagai list pengaturan, bukan petunjuk manual saja.
    · Subkategori command.2: [Implementasi] Tambahkan `.setmenu widgetdesign`.
    · Subkategori command.3: [Implementasi] Tambahkan `.setmenu energywidget on|off`.
    · Subkategori command.4: [Implementasi] Tambahkan `.setmenu pages` untuk batas halaman.
    · Subkategori command.5: [Implementasi] Tambahkan `.setmenu global-default apply` khusus owner.
    · Subkategori command.6: [Upgrade] Tambahkan reset terpisah untuk menu, status, profile, dan semua tampilan.
    · Subkategori command.7: [Test] Uji command tidak dikenal mengembalikan list bantuan.
    · Subkategori command.8: [Dokumentasi] Cantumkan contoh command dan hasilnya di README.
    · Subkategori command.9: [Test] Uji button list menjalankan command dengan argumen multi-token.
    · Subkategori command.10: [Bukti] Catat source handler setmenu yang diubah.

  · Kategori 4.2 Simbol dan template widget: Simbol dan template widget
    · Subkategori widget.1: [Implementasi] Tambahkan preset panah `› … ‹`.
    · Subkategori widget.2: [Implementasi] Tambahkan preset bintang `✦ … ✦`.
    · Subkategori widget.3: [Implementasi] Tambahkan preset diamond `◆ … ◆`.
    · Subkategori widget.4: [Implementasi] Tambahkan preset energi `⚡ … ✓`.
    · Subkategori widget.5: [Implementasi] Tambahkan preset tanpa simbol.
    · Subkategori widget.6: [Bug Fix] Reset simbol tidak mengubah template menu.
    · Subkategori widget.7: [Bug Fix] Desain widget tidak mengubah simbol before/after.
    · Subkategori widget.8: [Test] Uji kombinasi desain kawaii dan simbol panah.
    · Subkategori widget.9: [Dokumentasi] Jelaskan tiga lapisan: template menu, desain widget, simbol.
    · Subkategori widget.10: [Bukti] Tes default widget design dan symbols terpisah.

  · Kategori 4.3 Fake quote dan preview kartu: Fake quote dan preview kartu
    · Subkategori kartu.1: [Upgrade] Pilihan Fake Contact membuka menu pengaturan nama dan nomor.
    · Subkategori kartu.2: [Upgrade] Pilihan Fake Product membuka menu pengaturan nama dan harga.
    · Subkategori kartu.3: [Implementasi] Tambahkan pilihan URL gambar HTTPS untuk Fake Product.
    · Subkategori kartu.4: [Bug Fix] Respons set nama kontak memiliki tombol navigasi.
    · Subkategori kartu.5: [Bug Fix] Respons set harga produk memiliki tombol navigasi.
    · Subkategori kartu.6: [Dokumentasi] Beri label sintetis/preview agar tidak menyamar sebagai pengguna nyata.
    · Subkategori kartu.7: [Test] Tolak URL gambar non-HTTPS.
    · Subkategori kartu.8: [Test] Pastikan harga hanya disimpan sebagai teks preview.
    · Subkategori kartu.9: [Rencana] Uji dukungan gambar product quote terhadap Baileys versi aktual.
    · Subkategori kartu.10: [Bukti] Catat bahwa render gambar produk belum dijamin sampai live test.

  · Kategori 4.4 Status, Coin Mod, dan kontrol owner: Status, Coin Mod, dan kontrol owner
    · Subkategori owner.1: [Bug Fix] `.modcoin` tanpa argumen menampilkan menu interaktif.
    · Subkategori owner.2: [Upgrade] Tampilkan saldo dan akses riwayat Coin Mod.
    · Subkategori owner.3: [Upgrade] Pindahkan tombol saklar owner ke single-select list status.
    · Subkategori owner.4: [Upgrade] Pertahankan maksimal tiga quick replies di status utama.
    · Subkategori owner.5: [Implementasi] Sediakan item list Anti-Spam ON/OFF.
    · Subkategori owner.6: [Implementasi] Sediakan item list Global Cooldown ON/OFF.
    · Subkategori owner.7: [Implementasi] Sediakan item list Ganti Canvas status.
    · Subkategori owner.8: [Test] Pastikan saklar owner tetap memerlukan `ctx.isOwner`.
    · Subkategori owner.9: [Dokumentasi] Catat command status dan kontrol owner.
    · Subkategori owner.10: [Bukti] Verifikasi menu status memiliki dua quick reply dan satu list.

  · Kategori 4.5 Rekomendasi dan kemudahan penggunaan: Rekomendasi dan kemudahan penggunaan
    · Subkategori penggunaan.1: [Upgrade] Pertahankan filter rekomendasi konteks chat dari Stage 30.
    · Subkategori penggunaan.2: [Upgrade] Hindari rekomendasi command owner untuk pengguna biasa.
    · Subkategori penggunaan.3: [Upgrade] Hindari rekomendasi command grup pada DM.
    · Subkategori penggunaan.4: [Upgrade] Hindari rekomendasi command Premium jika akun tidak premium.
    · Subkategori penggunaan.5: [Upgrade] Hindari rekomendasi command ber-limit jika limit tidak tersedia.
    · Subkategori penggunaan.6: [Upgrade] Hindari rekomendasi command Coin Mod jika saldo/fitur tidak sesuai.
    · Subkategori penggunaan.7: [Rencana] Tampilkan persentase top-10 Explore dari statistik pemakaian aktual.
    · Subkategori penggunaan.8: [Test] Uji rekomendasi dengan kandidat lintas izin.
    · Subkategori penggunaan.9: [Dokumentasi] Jelaskan sumber data rekomendasi per pengguna.
    · Subkategori penggunaan.10: [Bukti] Jalankan ulang tes Stage 30 sebagai regression test.

Literasi 5: Keamanan, Performa, Observability, dan Operasional

  · Kategori 5.1 Akses, owner defaults, dan isolasi user: Akses, owner defaults, dan isolasi user
    · Subkategori user.1: [Implementasi] Batasi global-default apply untuk owner.
    · Subkategori user.2: [Upgrade] Simpan actor dan timestamp saat baseline global diperbarui.
    · Subkategori user.3: [Upgrade] Pertahankan per-user override setelah owner menerapkan baseline.
    · Subkategori user.4: [Implementasi] Reset menu tidak menghapus progres RPG.
    · Subkategori user.5: [Implementasi] Reset profile tidak menghapus Coin Mod atau XP.
    · Subkategori user.6: [Test] Uji akses global-default ditolak untuk non-owner.
    · Subkategori user.7: [Dokumentasi] Jelaskan baseline default bukan pemaksaan override user permanen.
    · Subkategori user.8: [Rencana] Tambahkan audit log untuk semua reset tampilan.
    · Subkategori user.9: [Test] Uji gambar profil tidak tertukar antar user.
    · Subkategori user.10: [Bukti] Catat path file gambar yang memakai chat dan sender.

  · Kategori 5.2 Serializer dan kompatibilitas WhatsApp: Serializer dan kompatibilitas WhatsApp
    · Subkategori WhatsApp.1: [Bukti] Dokumentasikan nama serializer yang benar dari source arsip.
    · Subkategori WhatsApp.2: [Upgrade] Teruskan forwardedLabelMode pada interactive responses melalui middleware.
    · Subkategori WhatsApp.3: [Upgrade] Teruskan konfigurasi quote dan fake preview ke interactive responses.
    · Subkategori WhatsApp.4: [Test] Pastikan mode off tidak menambahkan forwarded metadata dari helper.
    · Subkategori WhatsApp.5: [Test] Pastikan short memakai forwardingScore 1.
    · Subkategori WhatsApp.6: [Test] Pastikan full memakai metadata forwarding lengkap.
    · Subkategori WhatsApp.7: [Dokumentasi] Tegaskan WhatsApp client dapat mengubah tampilan metadata.
    · Subkategori WhatsApp.8: [Rencana] Tambahkan Baileys socket mock untuk bentuk native-flow.
    · Subkategori WhatsApp.9: [Rencana] Lakukan uji manual Android dan WhatsApp Web.
    · Subkategori WhatsApp.10: [Bukti] Jangan klaim kompatibilitas live hanya dari static test.

  · Kategori 5.3 Performa dan konsistensi file: Performa dan konsistensi file
    · Subkategori file.1: [Upgrade] Serialisasi write leveling dalam satu proses.
    · Subkategori file.2: [Test] Jalankan 40 XP award paralel tanpa kehilangan points.
    · Subkategori file.3: [Upgrade] Gunakan atomic rename untuk penyimpanan JSON menu.
    · Subkategori file.4: [Rencana] Tambahkan backup berkala untuk leveling.json.
    · Subkategori file.5: [Rencana] Tambahkan validasi skema saat membaca ledger lama.
    · Subkategori file.6: [Dokumentasi] Jelaskan batas MAX_USERS energy ledger.
    · Subkategori file.7: [Test] Uji 100 transaksi Coin Mod dan retensi history.
    · Subkategori file.8: [Rencana] Tambahkan lock lintas proses atau database transaction.
    · Subkategori file.9: [Rencana] Ukur latency file write pada 1000 pengguna simulasi.
    · Subkategori file.10: [Bukti] Catat bahwa single-process lock tidak melindungi beberapa replica.

  · Kategori 5.4 Logging, status, dan observability: Logging, status, dan observability
    · Subkategori observability.1: [Upgrade] Tampilkan Coin Mod dalam widget menu dan profile smart energy.
    · Subkategori observability.2: [Upgrade] Pertahankan status owner untuk runtime, memory, PID, dan energi.
    · Subkategori observability.3: [Upgrade] Pindahkan Koin Mod dan saklar status ke list agar tidak memenuhi quick reply.
    · Subkategori observability.4: [Test] Uji command `.modcoin` tidak berakhir tanpa respons.
    · Subkategori observability.5: [Test] Uji status canvas dapat diubah owner.
    · Subkategori observability.6: [Dokumentasi] Jelaskan status tidak mengukur kapasitas disk.
    · Subkategori observability.7: [Rencana] Tambah counter untuk command yang diblokir energi nol.
    · Subkategori observability.8: [Rencana] Tambah audit event reset menu dan profile.
    · Subkategori observability.9: [Test] Pastikan log tidak menyimpan isi pesan privat.
    · Subkategori observability.10: [Bukti] Lampirkan report `verify:all`.

  · Kategori 5.5 Release, recovery, dokumentasi, dan memori: Release, recovery, dokumentasi, dan memori
    · Subkategori memori.1: [Dokumentasi] Update README bot Stage 32.
    · Subkategori memori.2: [Dokumentasi] Update changelog bot ke 2.18.0.
    · Subkategori memori.3: [Dokumentasi] Tambahkan MEMORY.md untuk arahan kerja lanjutan.
    · Subkategori memori.4: [Dokumentasi] Tambahkan report QA Stage 32.
    · Subkategori memori.5: [Dokumentasi] Update README RPG companion Stage 32.
    · Subkategori memori.6: [Dokumentasi] Update changelog RPG companion ke 2.12.0.
    · Subkategori memori.7: [Test] Tambahkan `verify:stage32` pada kedua proyek.
    · Subkategori memori.8: [Bukti] Jalankan tes bot `verify:all` hingga Stage 32.
    · Subkategori memori.9: [Bukti] Jalankan verifikasi route Stage 32 pada website.
    · Subkategori memori.10: [Rencana] Lakukan live smoke test WhatsApp sebelum deploy produksi.


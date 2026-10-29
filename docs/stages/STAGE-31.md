# Stage 31 — Audit, Coin Mod Ledger, RPG Input Policy, dan Monetisasi

Tanggal: 2026-10-29
Bot: 2.17.0 · Web: 2.11.0

## Status bukti

- Source Stage 30 tersedia dan dianalisis di `/tmp/stage30/bot/whiskay-bot` serta `/tmp/stage30/web/whiskay-rpg-companion` sebelum modifikasi.
- Implementasi nyata pada stage ini: riwayat transaksi Coin Mod terbatas, command `.modcoin history`, batas integer dan koordinat di route update RPG, tes, README, changelog, dan memori kerja.
- Belum diimplementasikan: payment gateway live, iklan/reward ads, affiliate live, subscription otomatis, transaksi RPG server-authoritative penuh, distributed locking.
- Semua subkategori yang tidak diberi status implementasi/test/bukti eksplisit adalah rencana, bukan klaim selesai.

## A. Ringkasan analisis source Stage 30

1. Bot memakai ESM Node.js 20+, plugin dinamis, Baileys 7.0.0-rc14, `src/lib/energy-worker.js`, dan file ledger `data/energy-ledger.json`.
2. Energi dihitung melalui `complexityScore`: clamp dinamis 0,25–8,75; fixed cost 0,05–10; konsumsi aktual tidak lebih dari saldo saat ini.
3. Regenerasi pasif bersifat opsional dan menambah 0,01 poin persentase setiap tick 1 detik hingga kapasitas. Saat charging, worker melewatkan passive regen.
4. Coin Mod sudah membiayai Fast Charge (biaya `(volt - 5) * 10`) dan upgrade kapasitas (+50 kapasitas dengan 100 koin). Saldo lama belum memiliki riwayat transaksi khusus.
5. Pembayaran `.buy modcoin` dan Premium saat ini masih berbasis instruksi/manual verification; tidak ditemukan bukti webhook payment gateway otomatis.
6. Mutasi file diserialisasi hanya dalam satu proses; JSON ledger belum aman sebagai sumber transaksi lintas replica.
7. Website Stage 30 memiliki helper validasi ID, integer, koordinat; `/api/player/update` sebelumnya hanya memeriksa finite/nonnegative untuk statistik dan belum membatasi batas atas/integer secara konsisten.
8. Stage 31 menerapkan riwayat Coin Mod dalam penulisan ledger yang sama dan batas input stat/posisi pada route update. Ini tidak mengklaim anti-cheat atau monetisasi live selesai.

## B. Matriks keputusan (Impact × Effort × Risk)

| Keputusan | Impact | Effort | Risk | Justifikasi dan mitigasi |
|---|---:|---:|---:|---|
| Sempurnakan: Coin Mod audit history | Tinggi | Sedang | Sedang | Saldo bisa diaudit; history disimpan bersama saldo dalam satu atomic write; rollback source ke Stage 30 jika schema bermasalah. |
| Tingkatkan: validasi RPG stats/coordinates | Tinggi | Rendah | Sedang | Mencegah nilai pecahan/tidak terbatas/di luar batas; batas disesuaikan untuk stat game dan diuji. |
| Tambahkan: `.modcoin history` | Sedang | Rendah | Rendah | Mempermudah pemeriksaan; target akun lain hanya owner; read-only. |
| Tunda: payment gateway otomatis | Tinggi | Tinggi | Tinggi | Butuh provider, legal/merchant readiness, signature verification, idempotency, sandbox, dan secret produksi. |
| Tunda: server-authoritative RPG economy | Sangat tinggi | Tinggi | Tinggi | Butuh RPC/database transaction dan migrasi game; jangan mengklaim dari validasi input saja. |
| Tunda: ads/affiliate/reward ads live | Sedang | Tinggi | Tinggi | Perlu disclosure, provider approval, consent, anti-abuse dan bukti deployment. |

## C. Ringkasan update Stage 31

- Bot version `2.17.0`: `makeModCoinEntry`, history per user maksimum 100 transaksi, `getModCoinHistory`, command `.modcoin history`, reason/reference untuk transaksi terkait.
- Web version `2.11.0`: stat update menerima safe integer dengan batas per field; `checkpoint` dan `position` divalidasi sebagai koordinat finite dalam rentang ±100.000.
- README, changelog, `MEMORY.md`, Stage 31 plan, dan tes diperbarui.
- Coin Mod history tidak mengubah saldo lama; record lama tanpa field history akan tetap terbaca dan history dimulai kosong saat transaksi berikutnya.

## D. Lima literasi × lima kategori × sepuluh subkategori (250 item)


Literasi 1: Fondasi, Energi, Ekonomi, dan Kualitas

  · Kategori 1.1: Audit energi dan konsumsi command
    · Subkategori 1.1.1: [Bukti] Temuan README menyebut estimasi dinamis dibatasi 0,25–8,75 poin dan fixed cost 0,05–10; rujukan `src/lib/energy-worker.js:complexityScore`.
    · Subkategori 1.1.2: [Dokumentasi] Jelaskan formula token, operator, kutipan, keunikan token, kelas karakter, hash leksikal, dan diskon kemiripan lima command terakhir.
    · Subkategori 1.1.3: [Upgrade fitur lama] Pertahankan clamp biaya dinamis 0,25–8,75 dan fixed cost 0,05–10; jangan ubah biaya plugin tanpa regression test.
    · Subkategori 1.1.4: [Bug fix] Tambahkan validasi input untuk biaya tetap NaN, Infinity, negatif, dan string numerik sebelum perubahan ledger.
    · Subkategori 1.1.5: [Test] Uji command kosong, teks 1.200 karakter, teks lebih panjang, unicode, dan input operator padat.
    · Subkategori 1.1.6: [Test] Uji bahwa biaya selalu dua desimal dan tidak melebihi energi pengguna yang tersisa.
    · Subkategori 1.1.7: [Dokumentasi] Catat bahwa konsumsi command dan charge baterai adalah dua jalur berbeda yang tidak boleh dihitung ganda.
    · Subkategori 1.1.8: [Rencana] Tambahkan klasifikasi perintah read-only versus operasi berat agar tarif tidak hanya mengandalkan panjang teks.
    · Subkategori 1.1.9: [Rencana] Tambahkan dry-run `.energy estimate <teks>` yang tidak mengurangi saldo energi.
    · Subkategori 1.1.10: [Bukti] Simpan output `npm run verify:stage31` dan test energi lama sebagai bukti regresi.

  · Kategori 1.2: Ledger energi dan regenerasi
    · Subkategori 1.2.1: [Bukti] Temuan `consumeEnergyUnlocked` menyimpan energi, jumlah command, total konsumsi, dan lima command terakhir dalam `data/energy-ledger.json`.
    · Subkategori 1.2.2: [Dokumentasi] Formula konsumsi aktual: `min(energi saat ini, estimasi biaya)` lalu energi dibatasi pada rentang 0 hingga kapasitas.
    · Subkategori 1.2.3: [Dokumentasi] Formula regenerasi pasif saat ini adalah +0,01 poin persentase setiap tick satu detik sampai kapasitas; worker hanya berjalan bila diaktifkan.
    · Subkategori 1.2.4: [Bug fix] Tambahkan tes batas kapasitas saat energi tepat penuh agar regen tidak menambah energi di atas kapasitas.
    · Subkategori 1.2.5: [Test] Uji bahwa akun yang sedang charging tidak menerima passive regen pada tick yang sama.
    · Subkategori 1.2.6: [Test] Uji error baca/tulis ledger agar status kegagalan terlihat dan tidak dianggap transaksi sukses.
    · Subkategori 1.2.7: [Rencana] Pisahkan indikator `energyChargeMode` dari konsumsi command di dashboard untuk mencegah interpretasi salah.
    · Subkategori 1.2.8: [Rencana] Tambahkan statistik regenerasi total tanpa menyimpan data perintah sensitif.
    · Subkategori 1.2.9: [Rencana] Buat migrasi schema ledger berversi tanpa menghapus field lama.
    · Subkategori 1.2.10: [Bukti] Arsipkan contoh ledger sintetis dengan saldo uji, bukan data pengguna produksi.

  · Kategori 1.3: Coin Mod dan transaksi ekonomi
    · Subkategori 1.3.1: [Bukti] Temuan `addModCoins`, `spendModCoins`, dan `upgradeBatteryCapacity` memodifikasi saldo di ledger energi yang sama.
    · Subkategori 1.3.2: [Implementasi] Tambahkan `modCoinHistory` per akun dengan maksimal 100 entri dan tulis riwayat bersama saldo pada satu atomic JSON write.
    · Subkategori 1.3.3: [Implementasi] Tambahkan `.modcoin history` untuk membaca sepuluh transaksi terbaru dari akun sendiri.
    · Subkategori 1.3.4: [Implementasi] Batasi `.modcoin history <nomor/JID>` untuk target akun lain hanya kepada owner.
    · Subkategori 1.3.5: [Implementasi] Catat alasan dan referensi tersanitasi untuk kredit owner, Fast Charge, refund Fast Charge, dan upgrade kapasitas.
    · Subkategori 1.3.6: [Test] Pastikan pengeluaran melebihi saldo gagal tanpa mengubah saldo atau menambah riwayat.
    · Subkategori 1.3.7: [Test] Pastikan riwayat terpotong menjadi 100 entri terbaru saat ledger bertambah.
    · Subkategori 1.3.8: [Dokumentasi] Definisikan Coin Mod sebagai saldo virtual internal, bukan uang tunai, bukan Gold RPG, dan bukan bukti pembayaran.
    · Subkategori 1.3.9: [Rencana] Ganti penyimpanan file dengan transaksi database/unique transaction ID sebelum menjalankan beberapa replica bot.
    · Subkategori 1.3.10: [Bukti] Bukti Stage 31 tersedia pada `test/stage31-economy.test.js` dan `docs/stages/STAGE-31.md`.

  · Kategori 1.4: Error handling dan pemulihan
    · Subkategori 1.4.1: [Bukti] README lama menyebut mutasi file diserialisasi dalam satu proses dan tidak menjamin locking lintas replica.
    · Subkategori 1.4.2: [Dokumentasi] Bedakan error ledger, energi tidak cukup, saldo Coin Mod tidak cukup, dan provider pembayaran tidak tersedia.
    · Subkategori 1.4.3: [Bug fix] Pertahankan saldo saat `.modcoin history` gagal membaca file; command baca tidak boleh memutasi ekonomi.
    · Subkategori 1.4.4: [Test] Simulasikan file ledger JSON rusak dan pastikan hasil serta pesan diagnostik terdefinisi.
    · Subkategori 1.4.5: [Test] Simulasikan disk penuh/rename gagal pada atomic write dalam test terisolasi.
    · Subkategori 1.4.6: [Rencana] Tambahkan snapshot backup ledger berkala dengan retensi terbatas dan izin file ketat.
    · Subkategori 1.4.7: [Rencana] Tambahkan owner command `.economy check` untuk mendeteksi saldo negatif atau riwayat malformed.
    · Subkategori 1.4.8: [Rencana] Tambahkan dry-run pemulihan sebelum menulis ulang ledger yang rusak.
    · Subkategori 1.4.9: [Dokumentasi] Tuliskan langkah pemulihan: hentikan bot, salin ledger, validasi JSON, lalu pulihkan backup.
    · Subkategori 1.4.10: [Bukti] Sertakan hasil simulasi error ke laporan QA tanpa menyertakan nomor WhatsApp nyata.

  · Kategori 1.5: QA, rilis, dan bukti fondasi
    · Subkategori 1.5.1: [Implementasi] Tambahkan script `verify:stage31` ke `package.json` bot untuk menjalankan tes ledger Coin Mod.
    · Subkategori 1.5.2: [Test] Jalankan tes energy worker lama dan tes Stage 23–30 sebagai regression suite.
    · Subkategori 1.5.3: [Dokumentasi] Tambahkan daftar fitur yang benar-benar diuji lokal versus yang belum diuji di WhatsApp live.
    · Subkategori 1.5.4: [Dokumentasi] Tambahkan changelog versi bot 2.17.0 dan web 2.11.0.
    · Subkategori 1.5.5: [Bukti] Simpan test khusus Stage 31 di `test/stage31-economy.test.js`.
    · Subkategori 1.5.6: [Test] Pastikan archive lama tetap memuat dokumen stage sebelumnya setelah packaging.
    · Subkategori 1.5.7: [Rencana] Tambahkan pemeriksaan dependency lockfile agar package-lock sejalan dengan package.json.
    · Subkategori 1.5.8: [Rencana] Tambahkan `npm audit` pada pipeline terpisah dan review manual temuan sebelum upgrade mayor.
    · Subkategori 1.5.9: [Dokumentasi] Buat prosedur release: backup, verify, diff review, zip integrity check, rollback.
    · Subkategori 1.5.10: [Bukti] Catat checksum SHA-256 setiap ZIP rilis pada manifest build.

Literasi 2: Monetisasi dan Fitur Penghasil Uang Asli

  · Kategori 2.1: Konsep bisnis dan unit ekonomi
    · Subkategori 2.1.1: [Rencana] Definisikan produk yang dijual: akses premium, layanan bot, produk digital, donasi, dan kosmetik RPG; jangan menyamakan semuanya dengan Coin Mod.
    · Subkategori 2.1.2: [Rencana] Hitung margin bersih dengan rumus pendapatan dikurangi fee gateway, refund, pajak, dan biaya hosting.
    · Subkategori 2.1.3: [Rencana] Uji tiga paket harga Premium berdasarkan biaya layanan dan willingness-to-pay, bukan janji pendapatan.
    · Subkategori 2.1.4: [Dokumentasi] Jelaskan bahwa Coin Mod adalah saldo virtual internal dan tidak dapat ditukar menjadi uang tunai kecuali ada kebijakan resmi yang tervalidasi.
    · Subkategori 2.1.5: [Rencana] Tetapkan batas pengeluaran dan harga yang transparan sebelum checkout.
    · Subkategori 2.1.6: [Rencana] Buat terms of service, kebijakan refund, privasi, dan kontak bantuan sebelum menerima pembayaran live.
    · Subkategori 2.1.7: [Rencana] Ukur conversion rate, recurring revenue, churn, refund rate, dan chargeback rate.
    · Subkategori 2.1.8: [Rencana] Pisahkan akun uji, transaksi sandbox, dan transaksi produksi dengan konfigurasi berbeda.
    · Subkategori 2.1.9: [Dokumentasi] Tambahkan tabel sumber pendapatan dan status implementasi ke README bisnis.
    · Subkategori 2.1.10: [Bukti] Simpan asumsi bisnis dan model biaya di `docs/monetization/` tanpa mengklaim pendapatan aktual.

  · Kategori 2.2: Pembayaran dan payment gateway
    · Subkategori 2.2.1: [Bukti] Temuan command `.buy modcoin` saat ini menampilkan instruksi pembayaran manual dan `.bukti` meminta pemeriksaan owner; belum ada webhook gateway otomatis.
    · Subkategori 2.2.2: [Rencana] Pilih gateway yang mendukung merchant Indonesia dan cocok dengan status legal/akun usaha.
    · Subkategori 2.2.3: [Rencana] Tambahkan endpoint pembuatan invoice dengan ID idempoten, jumlah rupiah, produk, dan expiry.
    · Subkategori 2.2.4: [Rencana] Tambahkan webhook pembayaran dengan verifikasi signature dari raw body sesuai dokumentasi provider.
    · Subkategori 2.2.5: [Rencana] Tolak webhook dengan signature salah, timestamp kedaluwarsa, atau event ID duplikat.
    · Subkategori 2.2.6: [Rencana] Gunakan status `pending`, `paid`, `expired`, `refunded`, dan `failed` dengan transisi yang tervalidasi.
    · Subkategori 2.2.7: [Test] Jalankan sandbox success, pending, timeout, duplicate webhook, amount mismatch, dan invalid signature.
    · Subkategori 2.2.8: [Rencana] Catat audit pembayaran tanpa menyimpan nomor kartu, secret, atau kredensial sensitif.
    · Subkategori 2.2.9: [Dokumentasi] Tambahkan variabel konfigurasi gateway hanya sebagai placeholder di `.env.example` dan README.
    · Subkategori 2.2.10: [Bukti] Jangan tandai pembayaran otomatis aktif sebelum bukti sandbox dan webhook test tersedia.

  · Kategori 2.3: Subscription dan premium
    · Subkategori 2.3.1: [Bukti] Temuan `.premium` saat ini merupakan aktivasi owner manual maksimal 30 hari; bukan subscription gateway otomatis.
    · Subkategori 2.3.2: [Rencana] Pisahkan masa Premium bot, akses website, dan langganan layanan jadibot agar hak akses tidak tercampur.
    · Subkategori 2.3.3: [Rencana] Buat tabel subscription dengan user ID, product ID, status, mulai, akhir, dan gateway reference.
    · Subkategori 2.3.4: [Rencana] Implementasikan pembaruan Premium idempoten berdasarkan invoice yang benar-benar paid.
    · Subkategori 2.3.5: [Rencana] Tambahkan notifikasi H-3 dan H-1 sebelum Premium berakhir dengan opt-out.
    · Subkategori 2.3.6: [Test] Uji masa langganan yang diperpanjang dua kali oleh webhook sama agar tidak dobel.
    · Subkategori 2.3.7: [Test] Uji downgrade saat subscription expired tanpa menghapus data RPG atau inventori.
    · Subkategori 2.3.8: [Dokumentasi] Jelaskan perbedaan Premium aktif manual dan Premium aktif dari pembayaran terverifikasi.
    · Subkategori 2.3.9: [Rencana] Tambahkan `.premium status` untuk menampilkan expiry dan sumber aktivasi yang aman.
    · Subkategori 2.3.10: [Bukti] Bukti integrasi wajib mencakup event gateway dan row subscription tersanitasi.

  · Kategori 2.4: Produk digital, referral, iklan, dan donasi
    · Subkategori 2.4.1: [Rencana] Buat katalog produk digital dengan SKU, versi, harga, checksum, dan kebijakan akses unduhan.
    · Subkategori 2.4.2: [Rencana] Buat kode referral yang mengikat referrer dan pengguna baru satu kali serta mencegah self-referral.
    · Subkategori 2.4.3: [Test] Uji referral berulang, nomor sama, akun terhubung, dan pola abuse sebelum memberikan reward.
    · Subkategori 2.4.4: [Rencana] Tambahkan donasi satu kali dengan ucapan terima kasih tanpa mengubah hak akses secara diam-diam.
    · Subkategori 2.4.5: [Rencana] Evaluasi rewarded ads hanya pada web yang mendukung format resmi dan tidak mendorong klik palsu.
    · Subkategori 2.4.6: [Dokumentasi] Jelaskan disclosure affiliate, tautan sponsor, dan cara pengguna menolak pemasaran.
    · Subkategori 2.4.7: [Rencana] Pisahkan reward ads dari energi berbayar agar kegagalan provider tidak mengurangi saldo.
    · Subkategori 2.4.8: [Rencana] Buat endpoint redeem produk digital dengan token sekali pakai dan waktu kedaluwarsa.
    · Subkategori 2.4.9: [Test] Uji unduhan produk setelah refund dan pencabutan entitlement.
    · Subkategori 2.4.10: [Bukti] Catat metrik monetisasi sebagai target/hasil terukur; jangan menampilkan pendapatan simulasi sebagai real.

  · Kategori 2.5: Coin Mod, energi, dan batas ekonomi
    · Subkategori 2.5.1: [Dokumentasi] Jelaskan biaya Fast Charge saat ini `(voltase - 5) × 10` Koin Mod untuk voltase di atas 5V.
    · Subkategori 2.5.2: [Dokumentasi] Jelaskan upgrade kapasitas baterai menambah 50 poin dengan biaya 100 Koin Mod, hingga kapasitas maksimum 10.000.
    · Subkategori 2.5.3: [Bug fix] Stage 31 mencatat kredit/debit dan refund Fast Charge pada riwayat; kegagalan charge mengembalikan biaya yang telah didebit.
    · Subkategori 2.5.4: [Rencana] Buat daftar harga produk Coin Mod yang stabil dan tidak mengubah harga berdasarkan nilai Premium secara membingungkan.
    · Subkategori 2.5.5: [Rencana] Tambahkan invoice ID pada setiap kredit berbayar agar satu pembayaran tidak dikreditkan dua kali.
    · Subkategori 2.5.6: [Test] Uji saldo overflow, jumlah negatif, nol, pecahan, dan jumlah lebih besar dari batas input.
    · Subkategori 2.5.7: [Dokumentasi] Tegaskan `.modcoin add` adalah kredit manual owner setelah verifikasi; bukan endpoint pembayaran otomatis.
    · Subkategori 2.5.8: [Rencana] Tambahkan refund Coin Mod dengan transaksi kompensasi baru, bukan menghapus riwayat lama.
    · Subkategori 2.5.9: [Rencana] Larang konversi Coin Mod menjadi uang nyata tanpa kebijakan hukum, ledger, dan mekanisme penarikan terpisah.
    · Subkategori 2.5.10: [Bukti] Tautkan README Coin Mod ke `docs/stages/STAGE-31.md` dan test ledger yang nyata.

Literasi 3: RPG Bot, Website, dan Dunia Terhubung

  · Kategori 3.1: Sinkronisasi bot dan profil pemain
    · Subkategori 3.1.1: [Bukti] Temuan bot menggunakan `rpgEconomyApi.js` dan `rpg-sync.js`; website menyediakan endpoint player snapshot berbasis token.
    · Subkategori 3.1.2: [Rencana] Buat kontrak field versi antara bot dan web agar nama field Gold/coin dan Mod Coin tidak tertukar.
    · Subkategori 3.1.3: [Bug fix] Tolak snapshot yang membawa player ID tidak valid sebelum memanggil database.
    · Subkategori 3.1.4: [Test] Uji token valid, token expired, player ID berbeda, dan permintaan tanpa token.
    · Subkategori 3.1.5: [Rencana] Tambahkan `schemaVersion` pada payload sync dan strategi migrasi backward-compatible.
    · Subkategori 3.1.6: [Rencana] Tambahkan retry dengan exponential backoff hanya untuk error transien dan operasi idempoten.
    · Subkategori 3.1.7: [Dokumentasi] Jelaskan bahwa timeout database bukan bukti transaksi berhasil.
    · Subkategori 3.1.8: [Rencana] Tambahkan correlation ID dari command bot sampai API website tanpa membocorkan JID ke log publik.
    · Subkategori 3.1.9: [Test] Uji sinkronisasi ulang payload identik agar tidak menduplikasi reward atau inventory.
    · Subkategori 3.1.10: [Bukti] Simpan fixture pemain sintetis untuk kontrak sync di `test/fixtures/`.

  · Kategori 3.2: Route API dan validasi input
    · Subkategori 3.2.1: [Bukti] Temuan Stage 30 menyediakan `parseBoundedInteger` dan `parseFiniteCoordinate`, tetapi route update sebelumnya menerima angka nonnegatif tanpa batas atas.
    · Subkategori 3.2.2: [Implementasi] Terapkan batas integer per stat pada `/api/player/update` untuk level, XP, HP, Gold, gems, shard, potions, floor, wins, dan losses.
    · Subkategori 3.2.3: [Implementasi] Validasi `checkpoint` dan `position` agar hanya objek dengan koordinat finite dalam rentang dunia yang diterima.
    · Subkategori 3.2.4: [Test] Pastikan angka pecahan, nilai terlalu besar, `Infinity`, dan posisi berupa array ditolak.
    · Subkategori 3.2.5: [Dokumentasi] Jelaskan bahwa batas input mengurangi payload rusak, tetapi belum membuat game sepenuhnya server-authoritative.
    · Subkategori 3.2.6: [Rencana] Pindahkan perhitungan reward combat ke RPC/server untuk mencegah klien mengirim Gold arbitrer.
    · Subkategori 3.2.7: [Rencana] Tambahkan schema validator yang dapat digunakan lintas route tanpa menambah dependency berat.
    · Subkategori 3.2.8: [Test] Uji payload dengan field tidak dikenal agar tidak tersimpan ke snapshot.
    · Subkategori 3.2.9: [Rencana] Batasi ukuran body JSON dan jumlah item inventory sebelum parsing berat.
    · Subkategori 3.2.10: [Bukti] Bukti verifikasi tersedia pada `scripts/verify-stage31.mjs`.

  · Kategori 3.3: Dungeon dan Open World
    · Subkategori 3.3.1: [Bukti] Temuan README Stage 29 menyebut dungeon terhubung secara navigasi, namun integrasi gameplay persisten tetap membutuhkan uji runtime.
    · Subkategori 3.3.2: [Rencana] Jadikan checkpoint dungeon sebagai koordinat/ID yang tervalidasi pada satu player snapshot.
    · Subkategori 3.3.3: [Rencana] Buat portal dungeon yang mempertahankan posisi open world sebelum pemain masuk.
    · Subkategori 3.3.4: [Rencana] Tambahkan reward floor hanya setelah server memvalidasi boss defeated dan checkpoint.
    · Subkategori 3.3.5: [Test] Uji reload halaman di tengah dungeon agar state tidak kembali ke floor awal secara diam-diam.
    · Subkategori 3.3.6: [Rencana] Sinkronkan inventori hasil dungeon ke endpoint transaksi server, bukan hanya state UI.
    · Subkategori 3.3.7: [Bug fix] Tolak floor di luar rentang 1–100 sebelum memilih data floor.
    · Subkategori 3.3.8: [Rencana] Tambahkan fallback jika asset boss gagal dimuat tanpa membuat pemain kehilangan save.
    · Subkategori 3.3.9: [Dokumentasi] Buat peta alur Open World → Dungeon → Reward → Open World di docs RPG.
    · Subkategori 3.3.10: [Bukti] Lampirkan rekaman test manual dengan player sintetis sebelum mengklaim integrasi live.

  · Kategori 3.4: Inventory, crafting, dan ekonomi RPG
    · Subkategori 3.4.1: [Bukti] Temuan website memiliki endpoint shop, craft, trade, auction, gacha, daily, dan guild; transaksi authoritative bergantung pada RPC Supabase.
    · Subkategori 3.4.2: [Rencana] Pastikan pembelian item memakai operasi database atomik untuk mengurangi Gold dan menambah inventory sekaligus.
    · Subkategori 3.4.3: [Test] Uji saldo Gold kurang, SKU tidak dikenal, transaksi duplikat, dan kegagalan RPC.
    · Subkategori 3.4.4: [Bug fix] Jangan menampilkan item dibeli jika RPC mengembalikan `transaction_failed` atau timeout.
    · Subkategori 3.4.5: [Rencana] Tambahkan idempotency key untuk pembelian, crafting, dan klaim daily reward.
    · Subkategori 3.4.6: [Rencana] Validasi inventory maksimal 200 item dan batas kuantitas per item.
    · Subkategori 3.4.7: [Dokumentasi] Bedakan Gold RPG, gems, spirit shards, dan Coin Mod bot dalam semua kartu profil.
    · Subkategori 3.4.8: [Test] Uji migrasi inventori lama tanpa menghapus field materials atau pet.
    · Subkategori 3.4.9: [Rencana] Buat riwayat transaksi RPG terpisah dari riwayat Coin Mod bot.
    · Subkategori 3.4.10: [Bukti] Simpan test RPC sandbox dan schema migration sebelum mengaktifkan ekonomi di produksi.

  · Kategori 3.5: Gameplay, akses, dan QA RPG
    · Subkategori 3.5.1: [Bukti] Temuan route player memeriksa token akses yang ditandatangani sebelum membaca snapshot.
    · Subkategori 3.5.2: [Upgrade fitur lama] Pertahankan validasi signature constant-time dan expiry saat menambah route gameplay.
    · Subkategori 3.5.3: [Test] Uji token dari pemain A dipakai untuk player B harus ditolak.
    · Subkategori 3.5.4: [Rencana] Tambahkan test perintah bot yang mengeluarkan link akses berumur pendek dan terikat ke pemain.
    · Subkategori 3.5.5: [Rencana] Buat smoke test landscape mobile untuk joystick, inventory, dan resume dungeon.
    · Subkategori 3.5.6: [Bug fix] Tangani request save saat pengguna keluar dari halaman agar tidak menulis payload parsial.
    · Subkategori 3.5.7: [Rencana] Tambahkan telemetry FPS lokal yang tidak mengirim identitas pengguna.
    · Subkategori 3.5.8: [Dokumentasi] Jelaskan cara menjalankan `npm run verify:all` untuk web dan bot secara terpisah.
    · Subkategori 3.5.9: [Test] Uji mode database tidak terkonfigurasi dan pastikan UI menyatakan save unavailable, bukan sukses.
    · Subkategori 3.5.10: [Bukti] Catat batasan test lokal versus staging browser, WhatsApp, dan Supabase live.

Literasi 4: Command Baru, UX, dan Otomasi

  · Kategori 4.1: Command catalog dan bantuan
    · Subkategori 4.1.1: [Upgrade fitur lama] Pertahankan registry plugin sebagai sumber nama command dan permission metadata.
    · Subkategori 4.1.2: [Rencana] Tambahkan `.commands search <kata>` dengan hasil maksimal 10 command yang boleh digunakan konteks aktif.
    · Subkategori 4.1.3: [Rencana] Tambahkan `.commands category <nama>` untuk menampilkan kategori tanpa membocorkan owner-only command.
    · Subkategori 4.1.4: [Bug fix] Hilangkan rekomendasi command group-only ketika pengguna sedang di private chat.
    · Subkategori 4.1.5: [Test] Uji command alias agar tidak muncul sebagai duplikat dalam statistik eksplorasi.
    · Subkategori 4.1.6: [Dokumentasi] Update tabel command README saat command publik baru ditambahkan.
    · Subkategori 4.1.7: [Rencana] Tambahkan contoh pemakaian dan kesalahan format untuk setiap command ekonomi.
    · Subkategori 4.1.8: [Rencana] Tampilkan kebutuhan Premium/limit/Coin Mod sebelum tombol menjalankan command berbiaya.
    · Subkategori 4.1.9: [Test] Uji halaman menu kosong dan kategori yang tidak punya command aktif.
    · Subkategori 4.1.10: [Bukti] Simpan snapshot output menu untuk template text dan interactive.

  · Kategori 4.2: Rekomendasi dan Explore
    · Subkategori 4.2.1: [Bukti] Temuan Stage 30 filter sudah mengecualikan owner, premium, group/private mismatch, limit dan Coin Mod yang tidak cukup.
    · Subkategori 4.2.2: [Upgrade fitur lama] Gunakan filter rekomendasi setelah menghimpun metadata command dan sebelum menyusun tombol.
    · Subkategori 4.2.3: [Rencana] Tambahkan skor relevansi berdasarkan command yang benar-benar digunakan pengguna, bukan isi chat pengguna lain.
    · Subkategori 4.2.4: [Rencana] Tambahkan `.explore top` untuk menampilkan 10 command terpopuler dalam konteks yang diizinkan.
    · Subkategori 4.2.5: [Rencana] Tambahkan `.explore stats` untuk statistik kandidat, tersaring, ditampilkan, dan persentase coverage.
    · Subkategori 4.2.6: [Test] Pastikan command owner, premium, limit, atau Coin Mod tidak direkomendasikan bila syaratnya tidak terpenuhi.
    · Subkategori 4.2.7: [Test] Uji private chat, group, admin group, owner, premium, dan pengguna dengan limit nol.
    · Subkategori 4.2.8: [Rencana] Tambahkan saklar owner `.recommendations on|off` dengan default terdokumentasi.
    · Subkategori 4.2.9: [Dokumentasi] Jelaskan formula persentase sebagai count tampil dibagi count kandidat eligible, bukan peluang sukses.
    · Subkategori 4.2.10: [Bukti] Catat contoh statistik menggunakan data sintetis dan hindari nomor pengguna dalam laporan.

  · Kategori 4.3: Menu dan pengaturan interaktif
    · Subkategori 4.3.1: [Bukti] Temuan Stage 29 menambahkan template dan kontrol menu tetapi AI menu masih hanya konfigurasi sampai provider terhubung.
    · Subkategori 4.3.2: [Upgrade fitur lama] Tampilkan ringkasan semua preferensi menu aktif, termasuk template, font, simbol, widget, dan mode kutipan.
    · Subkategori 4.3.3: [Rencana] Tambahkan validasi pilihan template dan fallback ke fantasy bila konfigurasi lama tidak dikenal.
    · Subkategori 4.3.4: [Test] Uji reset per bagian dan reset semua tanpa menghapus pengaturan energi pengguna.
    · Subkategori 4.3.5: [Rencana] Tambahkan preview menu yang tidak memotong energi atau menghitung hit command produksi.
    · Subkategori 4.3.6: [Rencana] Kunci struktur AI-generated menu pada registry command dan permission metadata, bukan teks hasil model.
    · Subkategori 4.3.7: [Test] Uji AI mengusulkan command owner palsu dan pastikan renderer menghapusnya.
    · Subkategori 4.3.8: [Rencana] Tambahkan pagination menu dengan page count konsisten saat plugin dinonaktifkan.
    · Subkategori 4.3.9: [Dokumentasi] Tulis daftar template, simbol widget, serta tombol reset di README.
    · Subkategori 4.3.10: [Bukti] Simpan test menu regression dan snapshot layout untuk WhatsApp client yang didukung.

  · Kategori 4.4: GitHub, Imagine, Character, dan tools
    · Subkategori 4.4.1: [Bukti] Temuan source memuat `src/plugins/tools/github.js`, `imagine.js`, dan `character.js`.
    · Subkategori 4.4.2: [Upgrade fitur lama] Pastikan `.github` membatasi URL ke host GitHub yang diizinkan dan menangani API rate limit.
    · Subkategori 4.4.3: [Bug fix] Validasi prompt `.imagine` agar string kosong dan input terlalu panjang ditolak sebelum panggilan provider.
    · Subkategori 4.4.4: [Rencana] Tambahkan cache metadata GitHub dengan TTL singkat agar permintaan berulang tidak membebani provider.
    · Subkategori 4.4.5: [Test] Uji provider AI tidak dikonfigurasi dan tampilkan pesan konfigurasi tanpa stack trace.
    · Subkategori 4.4.6: [Rencana] Simpan karakter hasil `.character` hanya setelah konfirmasi pengguna dan batas ukuran terpenuhi.
    · Subkategori 4.4.7: [Rencana] Tambahkan command `.character list` dan `.character delete` dengan isolasi data per pengguna.
    · Subkategori 4.4.8: [Dokumentasi] Catat biaya provider gambar dan kebijakan konten sebelum membuka `.imagine` untuk publik.
    · Subkategori 4.4.9: [Test] Uji timeout, rate limit, dan response provider malformed.
    · Subkategori 4.4.10: [Bukti] Simpan mock provider test; jangan klaim gambar nyata dihasilkan bila API key tidak tersedia.

  · Kategori 4.5: UX, aksesibilitas, dan respon gagal
    · Subkategori 4.5.1: [Upgrade fitur lama] Samakan pesan error agar menyebut format yang benar tanpa menampilkan stack trace.
    · Subkategori 4.5.2: [Rencana] Tambahkan tombol ulang untuk request read-only yang aman dan idempoten.
    · Subkategori 4.5.3: [Bug fix] Pastikan tombol interaktif tidak mengarahkan pengguna ke command yang tidak tersedia pada versi aktif.
    · Subkategori 4.5.4: [Test] Uji judul tombol, ID callback, dan daftar pilihan pada batas panjang yang didukung client.
    · Subkategori 4.5.5: [Rencana] Tambahkan fallback text ketika interactive message tidak didukung versi Baileys/client.
    · Subkategori 4.5.6: [Dokumentasi] Berikan daftar gejala dan solusi untuk tombol yang tidak merespons.
    · Subkategori 4.5.7: [Rencana] Tambahkan bahasa Indonesia sederhana pada pesan ekonomi dan energi.
    · Subkategori 4.5.8: [Test] Uji output dengan nama pengguna berisi emoji atau karakter unicode.
    · Subkategori 4.5.9: [Rencana] Tambahkan penanda loading hanya jika transport benar-benar mengembalikan status progress.
    · Subkategori 4.5.10: [Bukti] Simpan fixture output yang telah menyamarkan identitas dan informasi pembayaran.

Literasi 5: Keamanan, Performa, Observability, dan Operasional

  · Kategori 5.1: Identitas, izin, dan akses
    · Subkategori 5.1.1: [Bukti] Temuan bot memeriksa owner di plugin ekonomi dan web memverifikasi signed access token.
    · Subkategori 5.1.2: [Upgrade fitur lama] Pertahankan pemeriksaan owner di server handler meski tombol menu menyembunyikan command owner.
    · Subkategori 5.1.3: [Test] Uji `.modcoin add` dari akun non-owner harus ditolak tanpa mutasi ledger.
    · Subkategori 5.1.4: [Test] Uji `.modcoin history <target>` oleh non-owner harus ditolak.
    · Subkategori 5.1.5: [Rencana] Tambahkan audit untuk perubahan harga dan grant Premium dengan actor ID tersanitasi.
    · Subkategori 5.1.6: [Bug fix] Jangan menerima JID grup sebagai ID akun ekonomi personal jika route membutuhkan player UUID.
    · Subkategori 5.1.7: [Rencana] Tambahkan rotasi token sync dengan overlap waktu yang terdokumentasi.
    · Subkategori 5.1.8: [Dokumentasi] Simpan secret hanya di environment server; jangan memasukkan `.env` ke ZIP.
    · Subkategori 5.1.9: [Test] Uji token kosong, signature invalid, expired token, dan target mismatch.
    · Subkategori 5.1.10: [Bukti] Sertakan matriks izin per command dalam dokumentasi security.

  · Kategori 5.2: Persistensi, transaksi, dan backup
    · Subkategori 5.2.1: [Bukti] Temuan JSON ledger aman hanya untuk serialisasi dalam satu proses, bukan distributed lock multi-replica.
    · Subkategori 5.2.2: [Upgrade fitur lama] Catat Coin Mod history di object akun yang sama dan file write yang sama dengan saldo.
    · Subkategori 5.2.3: [Rencana] Migrasikan saldo Coin Mod ke tabel SQL dengan unique transaction ID sebelum menambah payment webhook.
    · Subkategori 5.2.4: [Test] Uji dua pembelanjaan bersamaan di database transaksi saat migrasi dilakukan.
    · Subkategori 5.2.5: [Rencana] Tambahkan checksum backup ledger dan verifikasi restore sebelum bot start.
    · Subkategori 5.2.6: [Bug fix] Tolak kredit yang akan melewati `Number.MAX_SAFE_INTEGER`.
    · Subkategori 5.2.7: [Rencana] Tambahkan versi schema pada ledger dan migrator idempoten.
    · Subkategori 5.2.8: [Dokumentasi] Jelaskan risiko kehilangan file, korupsi JSON, dan ketidakcocokan multi-instance.
    · Subkategori 5.2.9: [Test] Uji upgrade dari record lama tanpa `modCoinHistory` agar history baru mulai sebagai array kosong.
    · Subkategori 5.2.10: [Bukti] Sertakan sample ledger uji yang telah dianonimkan.

  · Kategori 5.3: Performa, resource, dan batas input
    · Subkategori 5.3.1: [Bukti] Temuan energy worker menggunakan queue mutasi, write queue, batas 5.000 akun dan history Coin Mod 100 transaksi.
    · Subkategori 5.3.2: [Upgrade fitur lama] Pertahankan batas maksimum 100 user per halaman dashboard energi.
    · Subkategori 5.3.3: [Rencana] Tambahkan pengukuran waktu baca/tulis ledger tanpa merekam isi command.
    · Subkategori 5.3.4: [Test] Uji history limit 1, 10, 50, nilai negatif, dan input nonnumerik.
    · Subkategori 5.3.5: [Rencana] Tambahkan batas body JSON untuk endpoint save dan sync.
    · Subkategori 5.3.6: [Bug fix] Pastikan koordinat Infinity, NaN, dan di luar ±100.000 ditolak oleh route update.
    · Subkategori 5.3.7: [Rencana] Profilkan proses regenerasi pada 5.000 akun sintetis dan tetapkan budget durasi tick.
    · Subkategori 5.3.8: [Rencana] Pindahkan regen ke scheduler database jika multi-replica menjadi target deployment.
    · Subkategori 5.3.9: [Dokumentasi] Catat metrik RSS, heap, pending writes, dan batas interpretasinya.
    · Subkategori 5.3.10: [Bukti] Simpan hasil test beban lokal dengan jumlah record dan perangkat/runtime yang digunakan.

  · Kategori 5.4: Logging, metrik, dan incident response
    · Subkategori 5.4.1: [Upgrade fitur lama] Pertahankan logger yang membedakan event, command, dan error tanpa menulis secret.
    · Subkategori 5.4.2: [Rencana] Tambahkan event `modcoin.credit`, `modcoin.debit`, `modcoin.refund` dengan transaction reference tersanitasi.
    · Subkategori 5.4.3: [Rencana] Tambahkan counter pembayaran pending/paid/refunded setelah gateway resmi terintegrasi.
    · Subkategori 5.4.4: [Test] Pastikan nomor telepon, access token, QRIS file path, dan secret tidak muncul pada log publik.
    · Subkategori 5.4.5: [Rencana] Buat dashboard owner untuk jumlah transaksi Coin Mod dan status payment, bukan isi bukti transfer.
    · Subkategori 5.4.6: [Dokumentasi] Definisikan level log info, warning, error dan retensi file.
    · Subkategori 5.4.7: [Rencana] Buat runbook jika saldo tidak sesuai: hentikan perubahan, backup ledger, audit history, koreksi dengan transaksi kompensasi.
    · Subkategori 5.4.8: [Test] Uji logger tetap bekerja ketika folder log tidak tersedia atau disk penuh.
    · Subkategori 5.4.9: [Rencana] Tambahkan alert threshold untuk kegagalan write berulang dan payment webhook invalid.
    · Subkategori 5.4.10: [Bukti] Catat contoh incident report sintetis beserta langkah pemulihan.

  · Kategori 5.5: Deployment, dokumentasi, rollback, dan memori kerja
    · Subkategori 5.5.1: [Implementasi] Tambahkan `MEMORY.md` pada bot dan web berisi arahan kerja lintas stage.
    · Subkategori 5.5.2: [Dokumentasi] Tambahkan bagian Memori Arahan pada kedua README yang merujuk ke `MEMORY.md`.
    · Subkategori 5.5.3: [Dokumentasi] Catat command, konfigurasi, energi, Coin Mod, test, troubleshooting, dan status monetisasi di README bot.
    · Subkategori 5.5.4: [Dokumentasi] Catat validasi RPG route, batas input, status save, dan caveat server-authoritative di README web.
    · Subkategori 5.5.5: [Test] Jalankan `npm run verify:all` pada kedua proyek setelah perubahan Stage 31.
    · Subkategori 5.5.6: [Bukti] Simpan output verifikasi Stage 31 dan ringkasan file/diff pada laporan stage.
    · Subkategori 5.5.7: [Rencana] Tambahkan ZIP integrity check dan manifest SHA-256 sebelum membagikan arsip berikutnya.
    · Subkategori 5.5.8: [Dokumentasi] Tuliskan rollback dengan mengembalikan source backup Stage 30 dan menjaga salinan ledger terbaru.
    · Subkategori 5.5.9: [Rencana] Tambahkan staging deploy checklist sebelum menyentuh deployment production.
    · Subkategori 5.5.10: [Bukti] Jangan menandai fitur payment gateway, ads, affiliate, atau subscription otomatis aktif tanpa bukti integrasi live.

## E. Detail perubahan per literasi: file, alasan, dampak, risiko, rollback, bukti

### Literasi 1 — Fondasi, Energi, Ekonomi, dan Kualitas
- File: `bot/whiskay-bot/src/lib/energy-worker.js`, `src/plugins/owner/energy-system.js`, `test/stage31-economy.test.js`.
- Fungsi: `makeModCoinEntry`, `appendModCoinHistory`, `getModCoinHistory`, `addModCoins`, `spendModCoins`, `upgradeBatteryCapacity`, handler `.modcoin history`.
- Alasan: saldo Coin Mod sebelumnya bisa berubah tanpa history yang mudah dibaca.
- Dampak: format ledger lama tetap didukung; operasi baru menambahkan field `modCoinHistory` dengan retensi 100 entri.
- Risiko: file JSON tidak memberikan transaksi lintas replica; history hanya bukti ledger lokal dan bukan bukti pembayaran eksternal.
- Mitigasi: balance + history diserialisasi di mutation lock dan ditulis dalam satu atomic JSON write; jumlah dan saldo divalidasi.
- Rollback: hentikan bot, backup `data/energy-ledger.json`, kembalikan source Stage 30; field history tambahan tidak perlu dihapus dan diabaikan kode lama.
- Bukti: `test/stage31-economy.test.js` menguji sanitasi, invalid delta, spend gagal, saldo, history, dan cap 100.

### Literasi 2 — Monetisasi dan Fitur Penghasil Uang Asli
- File: `README.md`, `docs/stages/STAGE-31.md`, `CHANGELOG.md`.
- Status implementasi: konsep, dokumentasi alur manual, dan audit Coin Mod; gateway otomatis belum diimplementasikan.
- Dampak: pengguna mendapat penjelasan yang benar bahwa `.buy modcoin` menampilkan instruksi pembayaran dan `.bukti` memicu verifikasi manual.
- Risiko: klaim monetisasi berlebihan dapat menimbulkan kerugian dan masalah kepatuhan; mitigasi adalah tidak mengaktifkan penjualan otomatis tanpa sandbox, webhook signature, invoice idempotent, dan terms.
- Rollback: perubahan dokumentasi dapat di-revert; jangan melakukan rollback transaksi yang sudah dibayar tanpa audit.
- Bukti: README berisi definisi Coin Mod, command, harga Fast Charge/upgrade, payment manual, dan daftar integrasi tertunda.

### Literasi 3 — RPG Bot, Website, dan Dunia Terhubung
- File: `web/whiskay-rpg-companion/app/api/player/update/route.js`, `scripts/verify-stage31.mjs`.
- Fungsi: `POST` route update kini menggunakan batas safe integer per statistik dan validasi koordinat `checkpoint`/`position`.
- Alasan: validasi Stage 30 sebelumnya menerima banyak nilai finite nonnegatif tanpa batas atas atau integer.
- Dampak: payload dengan stat pecahan/di luar batas dan koordinat nonfinite/di luar rentang ditolak dengan 400.
- Risiko: game client yang mengirim angka pecahan untuk stat akan ditolak; mitigasi dengan batas stat integer yang didokumentasikan dan uji staging.
- Rollback: pulihkan route Stage 30 bila payload valid produksi terbukti bergantung pada pecahan; jangan matikan token check.
- Bukti: `scripts/verify-stage31.mjs` memeriksa helper dan route contract.

### Literasi 4 — Command Baru dan UX
- File: `src/plugins/owner/energy-system.js`, README command catalog.
- Fungsi: `.modcoin history [nomor/JID]` menampilkan saldo dan sepuluh transaksi terakhir; hanya owner dapat meminta target lain.
- Alasan: inspeksi saldo sebelumnya membutuhkan akses ledger manual.
- Dampak: command read-only; tidak mengubah saldo atau mengkredit Coin Mod.
- Risiko: JID dapat tampil di pesan privat; jangan menjalankan target history pada grup publik. Pertimbangkan penyamaran identifier pada iterasi berikutnya.
- Rollback: hapus handler `history` dan import `getModCoinHistory`; history ledger boleh tetap tersimpan.
- Bukti: tes persistence ledger dan pemeriksaan izin pada source; integrasi live WhatsApp masih perlu smoke test.

### Literasi 5 — Keamanan, Performa, Observability
- File: web update route, Stage 31 verification scripts, `MEMORY.md`, README, changelog.
- Fungsi: pembatasan payload stat dan posisi; dokumentasi keterbatasan multi-replica, transaksi, dan payment.
- Alasan: validasi input bukan pengganti transaksi server-authoritative dan signed access.
- Dampak: input malformed tertolak sebelum penulisan snapshot; signed-token verification tetap dipertahankan.
- Risiko: user dapat tetap memanipulasi nilai stat yang masih diizinkan jika klien berhak mengirim payload; mitigasi berikutnya adalah memindahkan reward ekonomi ke RPC server.
- Rollback: revert route saja jika terjadi regresi, pertahankan pemeriksaan access token.
- Bukti: Stage 31 test dan output verify scripts.

## F. Detail energi

### Formula
- Dinamis: `complexityScore(command, previous)` menghitung token sampai 160, operator/math marker, kutipan, rasio token unik, kelas karakter, variasi leksikal deterministik, dan similarity terhadap maksimal lima command sebelumnya; hasil dibatasi 0,25–8,75 dan dibulatkan 2 desimal.
- Fixed plugin cost: nilai plugin dibatasi 0,05–10.
- Konsumsi aktual: `actualCost = min(currentEnergy, estimatedCost)`; `newEnergy = clamp(currentEnergy - actualCost, 0, capacity)`.
- Regenerasi opsional: +0,01 poin persentase per tick 1 detik sampai `maxBatteryCapacity`; tidak berlaku di tick saat akun sedang charging.
- Charging standar: 1 poin persentase per 252.000 ms pada 5V; waktu dihitung dari selisih kapasitas dan energi awal, disesuaikan `5 / volts`. Fast Charge di atas 5V membutuhkan Premium dan biaya Coin Mod.
- Batas: ledger lokal maksimal 5.000 user; riwayat Coin Mod maksimal 100 transaksi per user; pembacaan history maksimum 50 transaksi.

### Sumber konsumsi dan cooldown
- Middleware energi memproses command yang lolos pipeline; plugin dapat mendeklarasikan `energyCost` tetap, sedangkan command lainnya memakai estimator dinamis.
- Cooldown plugin dan global cooldown adalah kontrol terpisah dari energi; energi tidak otomatis pulih hanya karena cooldown selesai.
- Limit harian adalah sumber daya lain dari baterai dan Coin Mod; jangan menganggap saldo Limit sama dengan Coin Mod.

### Error handling dan test case
- Energi rendah: konsumsi dibatasi saldo tersisa, tidak menghasilkan energi negatif.
- Input fixed cost invalid: test perlu memastikan fallback/penolakan tidak menghasilkan biaya NaN.
- Ledger read/write gagal: logging saat ini ada, tetapi mode fail-open middleware yang sudah terdokumentasi berarti operator harus memantau error dan tidak menganggap debit berhasil.
- Test: input panjang, unicode, math-heavy, command berulang, energi nol, kapasitas maksimum, passive regen on/off, charging aktif, dan file ledger rusak.
- Risiko multi-instance: JSON lock hanya lokal proses; pindah ke database transaksi sebelum horizontal scaling.

## G. Coin Mod — definisi, command, konfigurasi, efek, migrasi, test, bukti

### Apa itu Coin Mod?
Coin Mod adalah mata uang virtual internal WhiskayBot yang disimpan sebagai integer `modCoins` pada ledger energi lokal. Ini berbeda dari Gold/Coin RPG website dan bukan uang tunai. Saldo Coin Mod tidak menjadi bukti pembayaran dan tidak dapat ditarik menjadi rupiah berdasarkan implementasi saat ini.

### Command
- `.modcoin history` — saldo dan sepuluh transaksi terbaru akun sendiri.
- `.modcoin history <nomor/JID>` — hanya owner; jangan tampilkan pada grup publik.
- `.modcoin add <nomor/JID> <jumlah>` — owner-only, hanya setelah pembayaran diverifikasi manual; tiap kredit tercatat dengan reason `owner-credit`.
- `.buy modcoin [jumlah]` — menampilkan instruksi pembayaran manual; tidak mengkredit otomatis.
- `.charge voltage <15|20|25|30|33>` — Fast Charge Premium; biaya `(volt - 5) * 10` Coin Mod. Kegagalan mulai charge melakukan refund dan mencatatnya.
- `.charge upgrade` — tambah kapasitas 50 dengan biaya 100 Coin Mod hingga kapasitas 10.000.

### Konfigurasi
- `.env`: `OWNERS` harus berisi owner tepercaya; jangan mengunggah `.env` ke repo.
- `.setpayment bank`, `.setpayment ewallet`, `.setpayment qris`, `.setpayment price`, `.setpayment rate` mengatur instruksi manual/harga Premium.
- Gateway, webhook secret, dan invoice production belum ditambahkan pada Stage 31; jangan menganggap konfigurasi manual sebagai integrasi otomatis.

### Efek ekonomi dan migrasi
- Kredit menambah `modCoins`; debit mengurangi saldo hanya jika cukup; debit yang gagal tidak menulis transaksi.
- Riwayat disimpan pada `modCoinHistory` di record user yang sama. Record lama tanpa field history tetap valid; tidak perlu migrasi destruktif.
- History mempertahankan 100 transaksi terakhir; jangan menghapus bukti pembayaran eksternal hanya karena history ledger terbatas.
- Untuk produksi multi-instance, pindahkan saldo dan transaksi ke SQL dengan unique reference/idempotency dan transaksi atomik.

### Test case dan bukti dokumentasi
- `test/stage31-economy.test.js`: sanitasi reason/reference, nilai invalid, kredit/debit, saldo kurang, urutan history, cap 100, dan persistensi ledger.
- `README.md`: bagian Stage 31 Coin Mod, formula energi, command, konfigurasi, migrasi, batasan, dan troubleshooting.
- `CHANGELOG.md`: entri 2.17.0.
- `docs/stages/STAGE-31.md`: audit dan rencana 250 subkategori.

## H. Bukti update README, docs, tests, changelog

- Bot README diperbarui dengan formula energi, status Coin Mod, command history, dan arahan memori kerja.
- Web README diperbarui dengan batas stat dan koordinat serta catatan bahwa validasi bukan anti-cheat penuh.
- Changelog bot 2.17.0 dan web 2.11.0 ditambahkan.
- Tes baru: `test/stage31-economy.test.js` dan `scripts/verify-stage31.mjs`.
- Memori kerja permanen repo: `MEMORY.md` di kedua proyek.
- Verifikasi aktual dicatat setelah perintah dijalankan pada lingkungan ini; hasil tidak membuktikan live WhatsApp/Supabase/payment provider.

## I. Daftar file berubah dan diff ringkas

### Bot
- `package.json`: version 2.17.0 dan `verify:stage31` ditambahkan ke `verify:all`.
- `src/lib/energy-worker.js`: builder entry, capped history, API get history, dan history pada kredit/debit/upgrade.
- `src/plugins/owner/energy-system.js`: `.modcoin history`, alasan transaksi Fast Charge, dan respons kredit owner.
- `test/stage31-economy.test.js`: tes unit/persistensi history.
- `README.md`, `CHANGELOG.md`, `MEMORY.md`, `docs/stages/STAGE-31.md`.

### Web
- `package.json`: version 2.11.0 dan `verify:stage31` ditambahkan ke `verify:all`.
- `app/api/player/update/route.js`: batas safe integer untuk statistik dan koordinat checkpoint/position.
- `scripts/verify-stage31.mjs`: tes validasi dan access-token contract.
- `README.md`, `CHANGELOG.md`, `MEMORY.md`, `docs/STAGE-31.md`.

## Rollback umum
1. Simpan backup source dan `data/energy-ledger.json` sebelum deploy.
2. Jika tes regresi gagal, pulihkan folder source Stage 30 dan package manifests Stage 30.
3. Jangan menghapus field `modCoinHistory` dari ledger; source lama dapat mengabaikannya.
4. Jangan rollback atau mengedit transaksi pembayaran nyata secara manual; buat transaksi kompensasi yang diaudit.
5. Untuk web, revert hanya route update bila payload valid terdampak, namun pertahankan `verifyGameAccess`.

## J. Catatan memori untuk stage berikutnya

- Selalu mulai dari source repo/ZIP terbaru yang benar-benar tersedia; inventaris file dan baca `package.json`, README, changelog, test, serta implementasi relevan sebelum edit.
- Jangan mengklaim fitur selesai hanya karena dokumentasi dibuat; status harus dibuktikan dengan file, diff, test, atau bukti runtime.
- Setiap stage: 5 literasi × 5 kategori × 10 subkategori (250 item), dengan campuran bug fix, upgrade, fitur baru, QA, docs, bukti.
- Selalu update README, CHANGELOG, `MEMORY.md`, dokumentasi stage, test scripts, dan manifest ZIP.
- Pisahkan Gold RPG, Coin Mod, Premium, Limit, dan energi. Dokumentasikan formula energi, konsumsi, regenerasi, cooldown, batas, error handling, dan test.
- Monetisasi live memerlukan legal/merchant readiness, terms/refund, gateway sandbox, signature-verified webhook, idempotency, audit, dan bukti deployment.
- Jika repo/source tidak tersedia, berhenti dan minta file/tree/diff yang relevan; jangan mengarang analisis.
- Buat ZIP hanya setelah menjalankan tes, mengecek `unzip -t`, memastikan README dan dokumen stage ada, dan mengecualikan `.env`, session, data runtime, serta `node_modules`.


## Test run caveat (2026-10-29)

- `npm run verify:all` passed for this project.
- Bot `npm test`: 109/113 passed; 4 tests could not load `dotenv/config` because `npm ci` timed out in this environment. Do not treat the full suite as green until dependencies are installed and `npm test` is rerun.
- Web verification is static and does not prove production Supabase/deployment integration.

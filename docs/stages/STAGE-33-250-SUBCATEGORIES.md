# Stage 33 — 250 Subkategori Kerja

Sumber audit: [mruniquehacker/Knightbot-MD `commands/`](https://github.com/mruniquehacker/Knightbot-MD/tree/main/commands), branch `main`, 106 file terdaftar saat audit. Ini adalah rencana kerja berbasis perbandingan dengan Whiskay Stage 32, bukan klaim bahwa seluruh kandidat sudah diport.

## Literasi 1: Fondasi, audit repo, dan paritas command
### Kategori 1.1: Audit inventaris referensi
- Subkategori 1.1.1: [Bukti] Inventaris 106 nama file dari endpoint contents `commands/` pada branch `main` Knightbot-MD.
- Subkategori 1.1.2: [Implementasi] Bandingkan command kandidat dengan nama dan alias plugin Whiskay agar tidak menduplikasi fitur yang sudah ada.
- Subkategori 1.1.3: [Dokumentasi] Catat source audit dan tanggal pemeriksaan di Stage 33 README.
- Subkategori 1.1.4: [Test] Tambahkan tes yang memastikan plugin baru mendaftarkan command yang dijanjikan.
- Subkategori 1.1.5: [Implementasi] Pisahkan fitur yang portabel tanpa secret dari fitur yang memerlukan kredensial/provider eksternal.
- Subkategori 1.1.6: [Rencana] Audit lanjutan untuk semua command referensi yang bergantung pada media provider dan hak istimewa akun.
- Subkategori 1.1.7: [Dokumentasi] Tandai secara eksplisit file command yang setara dengan fitur Whiskay yang sudah ada.
- Subkategori 1.1.8: [Bukti] Simpan daftar command ditambahkan dan dikecualikan dalam laporan QA.
- Subkategori 1.1.9: [Risk] Hindari mengeksekusi source upstream langsung sebelum dependency dan lisensi diverifikasi.
- Subkategori 1.1.10: [Rollback] Hapus plugin tambahan Stage 33 dan kembalikan package/README ke commit arsip Stage 32 bila konflik registry muncul.

### Kategori 1.2: Kontrak plugin ESM Whiskay
- Subkategori 1.2.1: [Implementasi] Daftarkan community-fun sebagai plugin ESM dengan metadata `name`, `command`, `category`, dan `execute`.
- Subkategori 1.2.2: [Implementasi] Gunakan `ctx.reply` untuk fallback teks dan `ctx.sendInteractive` untuk alur tombol.
- Subkategori 1.2.3: [Test] Verifikasi tiap command fitur memiliki metadata yang dapat dibaca PluginManager.
- Subkategori 1.2.4: [Implementasi] Batasi masukan pengguna sebelum digunakan untuk judul, query, atau respons.
- Subkategori 1.2.5: [Dokumentasi] Jelaskan format command dengan contoh Bahasa Indonesia di README.
- Subkategori 1.2.6: [Risk] Hindari alias yang bertabrakan dengan command yang ada di registry.
- Subkategori 1.2.7: [Test] Inventarisasi tabrakan command/alias dengan pencarian di seluruh `src/plugins`.
- Subkategori 1.2.8: [Implementasi] Pertahankan prefix dari `ctx.prefix` di semua ID quick reply/list.
- Subkategori 1.2.9: [Dokumentasi] Jelaskan bagaimana loader mengelompokkan kategori plugin berdasar folder dan metadata.
- Subkategori 1.2.10: [Bukti] Catat file baru `src/plugins/fun/community-fun.js` dan tes metadata di laporan Stage 33.

### Kategori 1.3: Kompatibilitas serializer dan interaksi
- Subkategori 1.3.1: [Dokumentasi] Gunakan `src/core/serializer.js` sebagai facade dan `serializer-compat.cjs` sebagai kompatibilitas aktual.
- Subkategori 1.3.2: [Bukti] Catat bahwa `serializer-compact.cjs` tidak ditemukan di arsip Stage 32 yang diaudit.
- Subkategori 1.3.3: [Implementasi] Susun tombol trivia menggunakan quick reply dan list, bukan sembilan quick reply sekaligus.
- Subkategori 1.3.4: [Implementasi] Batasi tampilan setiap respons maksimal dua quick reply ditambah satu list pada alur utama.
- Subkategori 1.3.5: [Test] Pastikan tombol pengulangan mengeksekusi command yang valid dan tidak bergantung pada state pesan lama.
- Subkategori 1.3.6: [Dokumentasi] Jelaskan bahwa rendering akhir native-flow tetap bergantung pada versi klien WhatsApp/Baileys.
- Subkategori 1.3.7: [Risk] Jangan gunakan payload quoted untuk menyamarkan identitas atau mengelabui pengguna.
- Subkategori 1.3.8: [Implementasi] Tambahkan timeout sesi untuk mencegah tombol trivia/game lama tetap valid.
- Subkategori 1.3.9: [Test] Tolak ID sesi yang tidak cocok dengan sender/chat saat tombol diklik.
- Subkategori 1.3.10: [Rollback] Nonaktifkan plugin interaktif bila klien tertentu gagal merender list; pertahankan command teks dasar.

### Kategori 1.4: Konfigurasi, dependency, dan provider
- Subkategori 1.4.1: [Implementasi] Gunakan API Open-Meteo tanpa API key untuk geocoding dan kondisi cuaca.
- Subkategori 1.4.2: [Implementasi] Gunakan MyMemory untuk terjemahan dengan pasangan kode bahasa yang diizinkan.
- Subkategori 1.4.3: [Implementasi] Gunakan Jikan API untuk pencarian katalog anime dan manga.
- Subkategori 1.4.4: [Test] Pastikan parser bahasa menolak kode bahasa yang tidak masuk allowlist.
- Subkategori 1.4.5: [Test] Terapkan timeout network eksplisit pada setiap request eksternal.
- Subkategori 1.4.6: [Dokumentasi] Nyatakan kebutuhan akses internet keluar dan batas keandalan provider publik.
- Subkategori 1.4.7: [Risk] Jangan menambahkan API key hard-coded dari source referensi atau contoh pihak ketiga.
- Subkategori 1.4.8: [Dokumentasi] Beri tahu pengguna bahwa teks terjemahan dikirim ke provider pihak ketiga.
- Subkategori 1.4.9: [Implementasi] Berikan respons fallback yang tidak membocorkan stack trace atau header provider.
- Subkategori 1.4.10: [Bukti] Tes statis memastikan plugin baru tidak menyertakan token API dengan pola hard-coded.

### Kategori 1.5: Kualitas, regresi, dan recovery
- Subkategori 1.5.1: [Test] Tambahkan tujuh regression tests di `test/stage33-feature-parity.test.js`.
- Subkategori 1.5.2: [Test] Tes label cuaca untuk kode cerah, badai, dan kode tak dikenal.
- Subkategori 1.5.3: [Test] Tes parser terjemahan untuk input valid, invalid, kosong, dan teks panjang.
- Subkategori 1.5.4: [Test] Tes fungsi pemenang Tic-Tac-Toe untuk kemenangan dan seri.
- Subkategori 1.5.5: [Test] Tes pemblokiran langkah menang lawan pada Tic-Tac-Toe.
- Subkategori 1.5.6: [Test] Tes bahwa seluruh command hiburan kunci terdaftar dalam plugin.
- Subkategori 1.5.7: [Dokumentasi] Pisahkan keberhasilan unit test dari akses API live dalam laporan QA.
- Subkategori 1.5.8: [Rencana] Jalankan uji terintegrasi pada sesi WhatsApp nyata setelah dependency lengkap dipasang.
- Subkategori 1.5.9: [Dokumentasi] Simpan langkah rollback Stage 32 bila plugin menyebabkan tabrakan atau gagal load.
- Subkategori 1.5.10: [Bukti] Lampirkan hasil `node --test test/stage33-feature-parity.test.js` dan output pemeriksaan arsip.

## Literasi 2: Hiburan, trivia, dan permainan ringan
### Kategori 2.1: Command hiburan lokal
- Subkategori 2.1.1: [Implementasi] Tambahkan `.eightball` untuk jawaban hiburan terhadap pertanyaan pengguna.
- Subkategori 2.1.2: [Implementasi] Tambahkan alias `.8ball` dan `magic8ball` untuk mengurangi gesekan penulisan.
- Subkategori 2.1.3: [Implementasi] Tambahkan `.fact` berisi fakta sains ringan dalam dataset lokal.
- Subkategori 2.1.4: [Implementasi] Tambahkan `.joke` dengan materi lelucon ringan berbahasa Indonesia.
- Subkategori 2.1.5: [Implementasi] Tambahkan `.compliment` untuk pujian umum tanpa asumsi personal.
- Subkategori 2.1.6: [Implementasi] Tambahkan `.flirt` dengan gombalan ringan non-eksplisit.
- Subkategori 2.1.7: [Implementasi] Tambahkan `.insult` sebagai roasting bersahabat tanpa serangan pada identitas sensitif.
- Subkategori 2.1.8: [Implementasi] Tambahkan `.quote` dengan kutipan orisinal pendek, bukan salinan panjang karya berhak cipta.
- Subkategori 2.1.9: [Implementasi] Tambahkan `.shayari` dengan bait pendek orisinal berbahasa Indonesia.
- Subkategori 2.1.10: [Implementasi] Tambahkan `.roseday` sebagai ucapan mawar tematik yang bisa diulang melalui tombol.

### Kategori 2.2: Trivia ber-button
- Subkategori 2.2.1: [Implementasi] Tambahkan `.trivia` untuk memulai satu pertanyaan kuis.
- Subkategori 2.2.2: [Implementasi] Acak pemilihan pertanyaan dari dataset lokal terbatas.
- Subkategori 2.2.3: [Implementasi] Render pilihan jawaban sebagai tombol pilihan, bukan teks manual yang harus diketik.
- Subkategori 2.2.4: [Implementasi] Kaitkan jawaban pada ID ronde yang unik dan sender/chat pemilik sesi.
- Subkategori 2.2.5: [Implementasi] Kedaluwarsakan ronde trivia setelah dua menit.
- Subkategori 2.2.6: [Test] Tolak jawaban yang indeksnya di luar rentang pilihan.
- Subkategori 2.2.7: [Test] Tolak ronde yang sudah kedaluwarsa atau tidak cocok dengan ID sesi.
- Subkategori 2.2.8: [Dokumentasi] Tegaskan trivia tidak menambah XP/Gold RPG pada Stage 33.
- Subkategori 2.2.9: [Risk] Hilangnya state saat restart dilaporkan jelas karena sesi belum persisten.
- Subkategori 2.2.10: [Rencana] Tambahkan penyimpanan sesi durable hanya jika desain database untuk mini-game disetujui.

### Kategori 2.3: Tic-Tac-Toe solo
- Subkategori 2.3.1: [Implementasi] Tambahkan `.tictactoe` dan alias `.ttt` untuk game 3×3 melawan bot.
- Subkategori 2.3.2: [Implementasi] Render kotak kosong sebagai list dengan label A1 sampai C3.
- Subkategori 2.3.3: [Implementasi] Validasi bahwa kotak pilihan belum terisi sebelum mengubah papan.
- Subkategori 2.3.4: [Implementasi] Tambahkan pemilihan langkah bot untuk menang jika tersedia.
- Subkategori 2.3.5: [Implementasi] Tambahkan strategi dasar untuk memblokir langkah kemenangan pemain.
- Subkategori 2.3.6: [Test] Uji semua kombinasi garis kemenangan dalam helper `winner`.
- Subkategori 2.3.7: [Test] Uji hasil draw saat semua kotak terisi tanpa pemenang.
- Subkategori 2.3.8: [Implementasi] Cegah langkah untuk game ID yang tidak cocok dengan sesi pengguna.
- Subkategori 2.3.9: [Implementasi] Kedaluwarsakan sesi Tic-Tac-Toe setelah sepuluh menit.
- Subkategori 2.3.10: [Dokumentasi] Nyatakan game saat ini solo dan sesi dalam memori; belum ada matchmaking antarpengguna.

### Kategori 2.4: UX hiburan dan keamanan interaksi
- Subkategori 2.4.1: [Implementasi] Tambahkan `.funhelp` dengan daftar command hiburan.
- Subkategori 2.4.2: [Implementasi] Sediakan tombol ulang untuk command hiburan agar pengguna tidak perlu mengetik kembali.
- Subkategori 2.4.3: [Implementasi] Sediakan list pusat hiburan untuk berpindah aktivitas.
- Subkategori 2.4.4: [Dokumentasi] Beri label Magic 8-Ball sebagai hiburan, bukan ramalan atau nasihat profesional.
- Subkategori 2.4.5: [Dokumentasi] Batasi roasting pada humor yang tidak menyerang identitas atau kondisi pribadi.
- Subkategori 2.4.6: [Test] Pastikan semua command hiburan menggunakan kategori plugin `fun`.
- Subkategori 2.4.7: [Risk] Jangan mengklaim sifat kepribadian orang secara faktual berdasarkan permainan acak.
- Subkategori 2.4.8: [Implementasi] Batasi prompt Magic 8-Ball menjadi 180 karakter.
- Subkategori 2.4.9: [Implementasi] Bersihkan karakter kontrol pada teks sebelum disusun menjadi respons.
- Subkategori 2.4.10: [Rollback] Nonaktifkan hanya command yang bermasalah, bukan menghapus semua utilitas permainan.

### Kategori 2.5: Integrasi RPG dan batas ekonomi game
- Subkategori 2.5.1: [Dokumentasi] Pastikan trivia tidak menyentuh data leveling atau ekonomi pemain.
- Subkategori 2.5.2: [Dokumentasi] Pastikan Tic-Tac-Toe belum terhubung ke Gold, Coin Mod, atau inventory.
- Subkategori 2.5.3: [Rencana] Rancang reward mini-game melalui transaksi server-side idempoten, bukan kredit lokal.
- Subkategori 2.5.4: [Risk] Hindari hadiah ekonomi pada sesi game yang state-nya hanya tersimpan di RAM.
- Subkategori 2.5.5: [Dokumentasi] Bedakan XP leveling, Gold RPG, dan Coin Mod di README.
- Subkategori 2.5.6: [Test] Tes hanya helper game lokal tanpa mengakses data pemain produksi.
- Subkategori 2.5.7: [Rencana] Tambahkan analitik partisipasi game dengan metadata minimal dan tanpa isi pesan sensitif.
- Subkategori 2.5.8: [Rencana] Pertimbangkan matchmaking grup dengan pemeriksaan izin dan batas spam.
- Subkategori 2.5.9: [Dokumentasi] Catat bahwa tidak ada endpoint website RPG yang berubah pada Stage 33.
- Subkategori 2.5.10: [Bukti] Tandai RPG sebagai tidak berubah runtime karena tidak ada gap web yang terbukti dari folder command referensi.

## Literasi 3: Utilitas, pencarian, dan data pihak ketiga
### Kategori 3.1: Cuaca Open-Meteo
- Subkategori 3.1.1: [Implementasi] Tambahkan `.cuaca <kota>`; nama `.weather` sudah digunakan sebagai subcommand RPG dan tidak ditimpa.
- Subkategori 3.1.2: [Implementasi] Gunakan endpoint geocoding untuk mencocokkan nama kota.
- Subkategori 3.1.3: [Implementasi] Ambil suhu, terasa seperti, kelembapan, angin, dan curah hujan saat ini.
- Subkategori 3.1.4: [Implementasi] Petakan kode cuaca umum menjadi label Bahasa Indonesia.
- Subkategori 3.1.5: [Test] Uji label untuk clear, thunderstorm, dan unknown code.
- Subkategori 3.1.6: [Risk] Hindari menyebut kondisi current sebagai forecast jika endpoint tidak mengembalikan forecast.
- Subkategori 3.1.7: [Implementasi] Batasi query kota maksimal 80 karakter.
- Subkategori 3.1.8: [Implementasi] Set timeout 9 detik pada geocoding dan request weather.
- Subkategori 3.1.9: [Dokumentasi] Sebut Open-Meteo sebagai sumber dan jelaskan kondisi saat ini.
- Subkategori 3.1.10: [Troubleshooting] Berikan fallback saat kota tidak ditemukan atau provider tidak tersedia.

### Kategori 3.2: Terjemahan MyMemory
- Subkategori 3.2.1: [Implementasi] Tambahkan `.translate <asal> <tujuan> <teks>` dan alias `.terjemah`.
- Subkategori 3.2.2: [Implementasi] Batasi pasangan bahasa pada allowlist yang jelas.
- Subkategori 3.2.3: [Implementasi] Batasi teks input maksimal 1200 karakter sebelum request.
- Subkategori 3.2.4: [Implementasi] Encode teks dan pasangan bahasa dengan URLSearchParams.
- Subkategori 3.2.5: [Test] Tolak bahasa tidak didukung sebelum melakukan fetch.
- Subkategori 3.2.6: [Test] Tolak pesan tanpa teks terjemahan.
- Subkategori 3.2.7: [Risk] Beri peringatan bahwa input akan dikirim ke provider eksternal.
- Subkategori 3.2.8: [Implementasi] Tangani HTTP error, timeout, dan respons terjemahan kosong.
- Subkategori 3.2.9: [Dokumentasi] Jelaskan bahwa terjemahan otomatis dapat keliru untuk konteks penting.
- Subkategori 3.2.10: [Rencana] Pertimbangkan provider konfigurabel hanya jika diperlukan dan kredensial dikelola aman.

### Kategori 3.3: Pencarian katalog anime dan manga
- Subkategori 3.3.1: [Implementasi] Tambahkan `.anime <judul>` melalui API Jikan.
- Subkategori 3.3.2: [Implementasi] Tambahkan `.manga <judul>` melalui API Jikan.
- Subkategori 3.3.3: [Implementasi] Batasi hasil katalog menjadi lima item per query.
- Subkategori 3.3.4: [Implementasi] Tampilkan judul, jenis/status, skor bila tersedia, dan sinopsis pendek.
- Subkategori 3.3.5: [Implementasi] Sertakan URL sumber untuk memeriksa detail.
- Subkategori 3.3.6: [Test] Uji metadata plugin agar kedua command terdaftar.
- Subkategori 3.3.7: [Implementasi] Batasi query maksimal 100 karakter.
- Subkategori 3.3.8: [Implementasi] Tangani katalog kosong sebagai hasil wajar, bukan exception.
- Subkategori 3.3.9: [Risk] Jangan menganggap skor katalog sebagai rekomendasi universal.
- Subkategori 3.3.10: [Dokumentasi] Catat bahwa rate limit API publik dapat menyebabkan penolakan sementara.

### Kategori 3.4: Provider, cache, dan observabilitas
- Subkategori 3.4.1: [Implementasi] Set batas waktu 10 detik untuk request Jikan.
- Subkategori 3.4.2: [Implementasi] Set batas waktu 12 detik untuk penerjemahan.
- Subkategori 3.4.3: [Implementasi] Log error secara ringkas tanpa menyertakan data akun atau token.
- Subkategori 3.4.4: [Test] Jalankan test parser dan transformasi tanpa koneksi internet.
- Subkategori 3.4.5: [Dokumentasi] Pisahkan error provider, query kosong, dan hasil tidak ditemukan.
- Subkategori 3.4.6: [Rencana] Tambahkan cache TTL untuk katalog jika frekuensi query membutuhkan penghematan.
- Subkategori 3.4.7: [Risk] Jangan menambahkan retry tanpa batas pada provider yang membatasi laju.
- Subkategori 3.4.8: [Implementasi] Kirim error pengguna dalam bahasa Indonesia dan tanpa stack trace.
- Subkategori 3.4.9: [Test] Pastikan timeout tidak meninggalkan state sesi yang tidak konsisten.
- Subkategori 3.4.10: [Rollback] Cabut command eksternal jika provider berubah kontrak; command lokal tetap tersedia.

### Kategori 3.5: Inventaris fitur media yang belum dipenuhi
- Subkategori 3.5.1: [Bukti] Konfirmasi `imagine`, `character`, `sticker-maker`, TikTok, Instagram, Facebook, YouTube, dan meme sudah ada.
- Subkategori 3.5.2: [Bukti] Konfirmasi `github` memiliki statistik, commit, issue, dan workflow.
- Subkategori 3.5.3: [Rencana] Audit `.gif` secara terpisah karena provider GIF membutuhkan kebijakan API dan rate limit.
- Subkategori 3.5.4: [Rencana] Audit Spotify/song/play sesuai hak akses provider dan kebijakan hak cipta.
- Subkategori 3.5.5: [Rencana] Audit remove-background/remini/blur sesuai dependency, biaya dan API key.
- Subkategori 3.5.6: [Rencana] Audit lyrics dengan batas kutipan hak cipta sebelum menambah command.
- Subkategori 3.5.7: [Dokumentasi] Jangan mengklaim seluruh 106 file telah diport hanya karena telah diinvetarisasi.
- Subkategori 3.5.8: [Dokumentasi] Tandai kandidat media yang belum ada sebagai backlog, bukan fitur Stage 33.
- Subkategori 3.5.9: [Risk] Hindari endpoint layanan gratis tak terdokumentasi sebagai dependency produksi.
- Subkategori 3.5.10: [Bukti] Sediakan tautan repo sumber untuk tindak lanjut audit media.

## Literasi 4: Moderasi, privasi, monetisasi, dan rilis
### Kategori 4.1: Paritas group dan social
- Subkategori 4.1.1: [Bukti] Cocokkan `groupinfo`, `admins`, `tagall`, `hidetag`, `welcome`, dan `groupmanage` dengan group-tools Whiskay.
- Subkategori 4.1.2: [Bukti] Cocokkan `groupstatus`, `antibadword`, `antilink`, dan `antitag` dengan group-safety.
- Subkategori 4.1.3: [Rencana] Tambahkan alias hanya jika perbedaan semantik telah dibuktikan melalui source dan test.
- Subkategori 4.1.4: [Risk] Semua aksi administratif harus memeriksa `ctx.isAdmin` dan `ctx.isBotAdmin`.
- Subkategori 4.1.5: [Dokumentasi] Pertahankan scope per grup pada setting moderasi.
- Subkategori 4.1.6: [Test] Pastikan command group-only ditolak dari private chat.
- Subkategori 4.1.7: [Rencana] Audit welcome/goodbye event handler untuk duplikasi pesan sebelum mengadopsi template upstream.
- Subkategori 4.1.8: [Rencana] Audit topmembers agar data grup tidak dicampur ke private chat.
- Subkategori 4.1.9: [Dokumentasi] Catat fitur social yang sudah ada dan yang masih tertunda.
- Subkategori 4.1.10: [Rollback] Nonaktifkan command alias baru apabila menyebabkan command group lama tertimpa.

### Kategori 4.2: Fitur privasi dan command sensitif
- Subkategori 4.2.1: [Keputusan] Tidak menyalin `viewonce`/`vv2` secara otomatis karena dapat memintas ekspektasi privasi pesan sekali lihat.
- Subkategori 4.2.2: [Keputusan] Tidak menyalin anti-delete yang menyimpan/memublikasikan isi pesan tanpa tinjauan persetujuan dan retensi.
- Subkategori 4.2.3: [Keputusan] Tidak mengadopsi `.sudo` dari referensi tanpa model izin yang terverifikasi.
- Subkategori 4.2.4: [Keputusan] Tidak menyalin API key cuaca hard-coded yang ditemukan di `weather.js` referensi.
- Subkategori 4.2.5: [Dokumentasi] Cantumkan alasan pengecualian di README Stage 33.
- Subkategori 4.2.6: [Test] Cek source port baru agar tidak berisi token API hard-coded.
- Subkategori 4.2.7: [Risk] Data pesan privat tidak boleh dimasukkan ke logging atau cache provider.
- Subkategori 4.2.8: [Rencana] Evaluasi pengaturan autoread/autotyping hanya setelah integrasi runtime-state disusun.
- Subkategori 4.2.9: [Dokumentasi] Bedakan eksplisit command yang diport dari fitur yang sengaja dikecualikan.
- Subkategori 4.2.10: [Bukti] Test Stage 33 memeriksa tidak ada extractor view-once dalam plugin baru.

### Kategori 4.3: Monetisasi dan fitur penghasil uang asli
- Subkategori 4.3.1: [Dokumentasi] Coin Mod tetap saldo virtual, bukan rupiah; tidak ditambahkan sebagai fitur Stage 33.
- Subkategori 4.3.2: [Rencana] Payment gateway butuh endpoint invoice, verifikasi signature webhook, idempotensi dan audit settlement.
- Subkategori 4.3.3: [Rencana] Premium/subscription perlu masa berlaku, pembaruan, penghentian, dan rekonsiliasi pembayaran.
- Subkategori 4.3.4: [Rencana] Reward ads baru dapat aktif setelah provider valid dan callback tervalidasi.
- Subkategori 4.3.5: [Rencana] Affiliate/referral harus memiliki anti-fraud dan aturan atribusi yang jelas.
- Subkategori 4.3.6: [Rencana] Donasi harus membedakan janji manfaat, bukti pembayaran dan rekonsiliasi.
- Subkategori 4.3.7: [Rencana] Produk digital butuh idempotent fulfillment dan kebijakan refund.
- Subkategori 4.3.8: [Risk] Jangan memberi Coin Mod karena screenshot pembayaran tanpa verifikasi.
- Subkategori 4.3.9: [Dokumentasi] README harus menjelaskan biaya provider dan syarat layanan sebelum monetisasi live.
- Subkategori 4.3.10: [Bukti] Stage 33 tidak mengklaim ada pendapatan real-money karena tidak menambah integrasi pembayaran.

### Kategori 4.4: README, QA, troubleshooting, dan rollback
- Subkategori 4.4.1: [Dokumentasi] Tambahkan bagian Stage 33 di README bot dengan perintah baru dan provider.
- Subkategori 4.4.2: [Dokumentasi] Tambahkan Stage 33 ke CHANGELOG bot.
- Subkategori 4.4.3: [Dokumentasi] Tambahkan MEMORY.md terkait inventaris upstream dan batas keamanan.
- Subkategori 4.4.4: [Dokumentasi] Buat `STAGE-33.md` dengan analisis, keputusan dan risiko.
- Subkategori 4.4.5: [Dokumentasi] Buat laporan tes Stage 33 dengan output yang benar-benar dijalankan.
- Subkategori 4.4.6: [Test] Jalankan tujuh tes Stage 33 di lingkungan Node.js tanpa dependency eksternal.
- Subkategori 4.4.7: [Test] Jalankan script verifikasi web yang memvalidasi scope dokumentasi dan route tree.
- Subkategori 4.4.8: [Risk] Jangan sebut full `verify:all` lulus bila dependencies belum terpasang atau command gagal.
- Subkategori 4.4.9: [Rollback] Simpan arsip Stage 32 tanpa `.env`, sesi atau node_modules sebagai titik kembali.
- Subkategori 4.4.10: [Bukti] Arsipkan jumlah file, daftar file penting dan hasil `unzip -t` untuk kedua ZIP.

### Kategori 4.5: Kontrol rilis dan operasional
- Subkategori 4.5.1: [Implementasi] Tambahkan verifier Stage 33 ke script package bot dan web tanpa menghapus target verifikasi lama.
- Subkategori 4.5.2: [Test] Jalankan verifier web untuk memastikan README, changelog, memory, dan dokumen stage ada.
- Subkategori 4.5.3: [Dokumentasi] Catat bahwa folder referensi upstream hanya membuktikan daftar command, bukan runtime yang sedang berjalan.
- Subkategori 4.5.4: [Risk] Hindari perubahan route website jika audit acuan hanya berhubungan dengan command WhatsApp.
- Subkategori 4.5.5: [Dokumentasi] Simpan prosedur instalasi dependency dengan `npm ci` agar lockfile tetap menjadi sumber versi.
- Subkategori 4.5.6: [Test] Catat secara terpisah unit test Stage 33 dan full verify suite yang belum dijalankan.
- Subkategori 4.5.7: [Rollback] Gunakan arsip Stage 32 sebagai checkpoint untuk mengembalikan kode baru.
- Subkategori 4.5.8: [Dokumentasi] Daftarkan API publik yang dipakai dan dampaknya jika layanan tidak tersedia.
- Subkategori 4.5.9: [Implementasi] Gunakan pesan fallback yang aman agar kegagalan provider tidak menghentikan bot.
- Subkategori 4.5.10: [Bukti] Simpan daftar file baru dan jumlah kasus test pada laporan Stage 33.

## Literasi 5: Keamanan, privasi, observability, monetisasi, dan memori kerja
### Kategori 5.1: Pengamanan input dan state interaktif
- Subkategori 5.1.1: [Implementasi] Batasi setiap query provider dengan panjang maksimum sebelum URL dibentuk.
- Subkategori 5.1.2: [Test] Tolak pilihan trivia yang bukan integer valid atau berada di luar daftar opsi.
- Subkategori 5.1.3: [Implementasi] Cocokkan ID sesi game dengan kombinasi chat dan sender.
- Subkategori 5.1.4: [Implementasi] Kedaluwarsakan game yang tidak aktif agar state tidak menumpuk.
- Subkategori 5.1.5: [Risk] Jangan menyimpan isi pesan pengguna di log error eksternal.
- Subkategori 5.1.6: [Dokumentasi] Jelaskan bahwa sesi permainan di RAM hilang ketika bot restart.
- Subkategori 5.1.7: [Test] Pastikan game tidak memberi hadiah ekonomi atau XP tanpa transaksi RPG yang disetujui.
- Subkategori 5.1.8: [Keputusan] Jangan menambahkan pembaca view-once pada paket Stage 33.
- Subkategori 5.1.9: [Keputusan] Jangan mengadopsi command sudo tanpa permission model yang ditinjau.
- Subkategori 5.1.10: [Bukti] Regresi memastikan modul baru tidak menambahkan extractor view-once atau API key hard-coded.

### Kategori 5.2: Observability provider dan ketahanan
- Subkategori 5.2.1: [Implementasi] Terapkan `AbortSignal.timeout` pada request cuaca, terjemahan, dan katalog.
- Subkategori 5.2.2: [Implementasi] Log nama fitur dan jenis error, bukan token, teks pribadi, atau header.
- Subkategori 5.2.3: [Test] Uji fungsi mapping dan parser tanpa jaringan eksternal.
- Subkategori 5.2.4: [Dokumentasi] Bedakan kota tidak ditemukan dari provider timeout.
- Subkategori 5.2.5: [Dokumentasi] Tulis bahwa hasil unit test tidak menunjukkan API publik sedang sehat.
- Subkategori 5.2.6: [Rencana] Tambahkan cache TTL bila beban katalog anime/manga cukup tinggi.
- Subkategori 5.2.7: [Risk] Jangan memasang retry loop tanpa batas terhadap provider publik.
- Subkategori 5.2.8: [Implementasi] Gunakan pesan fallback Bahasa Indonesia untuk HTTP error dan timeout.
- Subkategori 5.2.9: [Test] Periksa bahwa endpoint gagal tidak menyebabkan sesi kuis menjadi valid selamanya.
- Subkategori 5.2.10: [Bukti] Catat provider, timeout dan batas input di `docs/stages/STAGE-33.md`.

### Kategori 5.3: Monetisasi dan uang asli — batas fitur
- Subkategori 5.3.1: [Dokumentasi] Bedakan Coin Mod virtual dari saldo bank, pembayaran, dan Gold RPG.
- Subkategori 5.3.2: [Rencana] Payment gateway wajib memiliki pembuatan invoice dan status yang disimpan persisten.
- Subkategori 5.3.3: [Rencana] Webhook wajib memverifikasi signature dan idempotency key sebelum kredit saldo.
- Subkategori 5.3.4: [Rencana] Premium/subscription perlu tanggal mulai, tanggal berakhir, renewal dan pembatalan.
- Subkategori 5.3.5: [Rencana] Reward ads harus memverifikasi callback provider agar reward tidak bisa dipalsukan.
- Subkategori 5.3.6: [Rencana] Affiliate/referral memerlukan aturan atribusi dan pencegahan self-referral/fraud.
- Subkategori 5.3.7: [Rencana] Donasi perlu rekonsiliasi pembayaran dan catatan transaksi yang dapat diaudit.
- Subkategori 5.3.8: [Rencana] Produk digital perlu idempotent fulfillment, pengiriman ulang, serta refund policy.
- Subkategori 5.3.9: [Risk] Stage 33 tidak mengklaim menghasilkan uang asli karena tidak ada gateway/provider monetisasi yang diaktifkan.
- Subkategori 5.3.10: [Bukti] README menyebut layanan publik yang ditambahkan dan mencatat bahwa tidak ada pembayaran baru.

### Kategori 5.4: QA release dan regresi lintas fitur
- Subkategori 5.4.1: [Test] Jalankan tujuh tes Stage 33 pada runtime Node.js tanpa dependency tambahan.
- Subkategori 5.4.2: [Test] Jalankan script scope checker website secara terpisah.
- Subkategori 5.4.3: [Rencana] Jalankan `npm ci` dan `npm run verify:all` pada environment Node.js 20 lengkap.
- Subkategori 5.4.4: [Dokumentasi] Jangan laporkan full suite sebagai lulus bila dependency tidak terpasang.
- Subkategori 5.4.5: [Test] Periksa package version dan script `verify:stage33` sebelum membuat arsip.
- Subkategori 5.4.6: [Test] Periksa ZIP dengan `unzip -t` dan daftar isi setelah arsip selesai dibuat.
- Subkategori 5.4.7: [Risk] Tidak mengubah file data runtime pengguna ke dalam arsip source.
- Subkategori 5.4.8: [Rollback] Jangan menimpa arsip Stage 32 sebagai checkpoint sebelum semua tes dan manifest selesai.
- Subkategori 5.4.9: [Dokumentasi] Cantumkan status tes network/live sebagai belum dijalankan.
- Subkategori 5.4.10: [Bukti] Simpan output hasil test dan daftar file berubah dalam laporan QA.

### Kategori 5.5: Memori arahan dan roadmap berikutnya
- Subkategori 5.5.1: [Dokumentasi] Tambahkan aturan audit upstream ke `MEMORY.md` bot.
- Subkategori 5.5.2: [Dokumentasi] Tambahkan batas scope antara WhatsApp command dan website RPG ke `MEMORY.md` web.
- Subkategori 5.5.3: [Dokumentasi] Catat ketidakpastian lisensi upstream dan hindari penyalinan verbatim jika tak diverifikasi.
- Subkategori 5.5.4: [Dokumentasi] Pertahankan struktur lima literasi, 25 kategori, 250 subkategori per stage.
- Subkategori 5.5.5: [Rencana] Stage berikutnya dapat mengaudit kategori media lanjutan setelah mengecek provider dan lisensi.
- Subkategori 5.5.6: [Rencana] Evaluasi persistent session trivia/game hanya setelah desain storage ada.
- Subkategori 5.5.7: [Rencana] Audit alias conflict secara penuh menggunakan PluginManager registry pada runtime yang terinstal.
- Subkategori 5.5.8: [Rencana] Jalankan pengujian tombol native-flow pada perangkat WhatsApp nyata.
- Subkategori 5.5.9: [Dokumentasi] Pertahankan daftar fitur yang sengaja tidak diport beserta alasan privasi/keamanan.
- Subkategori 5.5.10: [Bukti] Tautkan README, changelog, tes dan stage report dari ZIP stage berikutnya.


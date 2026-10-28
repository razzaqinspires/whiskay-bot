# Jadibot rental feature

## Commands
- `.jadibot` — tombol pilihan QR Code atau Pairing Code.
- `.jadibot qr` — membuat sesi QR; QR ditampilkan di terminal server, bukan sebagai gambar di chat.
- `.jadibot pairing 628xxxxxxxxxx` — meminta pairing code untuk nomor milik pengguna.
- `.jadibotstatus` — status, nomor, tanggal kedaluwarsa, dan sisa hari.
- `.jadibotlogin` — menyambungkan kembali sesi tersimpan yang belum kedaluwarsa.
- `.jadibotlogout` — logout dan hapus kredensial sesi lokal.
- `.perpanjang [hari]` — membuat permintaan pembayaran manual.
- `.buktijadibot REF` — reply gambar bukti pembayaran dan kirim command tersebut.
- `.listjadibot` — daftar sewa (owner).
- `.jadibotapprove USERKEY` — menyetujui pembayaran pending setelah dana benar-benar diverifikasi owner.
- `.stopjadibot USERKEY` — hentikan dan hapus sesi (owner).
- `.setjadibotharga nominal` — mengubah harga per durasi default.
- `.setjadibotdurasi hari` — mengubah durasi default (1–365 hari).
- `.setjadibotpay` — petunjuk metode pembayaran yang memakai `.setpayment` yang sudah ada.
- `.setjadibotpremium` — petunjuk pengelolaan premium memakai `.premium` yang sudah ada.

## Konfigurasi
Atur `JADIBOT_DEFAULT_DAYS=30` dan `JADIBOT_PRICE_30D=10000` di `.env`. Harga 10000 hanyalah nilai awal contoh; ubah sebelum digunakan. Harga dan durasi yang diubah melalui command disimpan ke `data/jadibot/settings.json`.

Metode pembayaran menggunakan konfigurasi `.setpayment` yang sudah ada. Pembayaran tidak otomatis diverifikasi: owner wajib memastikan dana masuk sebelum `.jadibotapprove`. Bukti transfer saja bukan bukti dana telah diterima.

## Catatan teknis dan keamanan
- QR hanya dicetak ke terminal lokal karena bundle ini tidak menyertakan encoder QR menjadi gambar. Pairing code dikirim lewat chat. Jangan pernah membagikan QR/kode login.
- Kredensial tiap sub-bot disimpan di `data/jadibot/sessions/`; jangan unggah folder tersebut ke GitHub atau kirim ke orang lain.
- Sub-bot memakai plugin command yang sama. Uji dahulu dengan akun WhatsApp kedua. Gunakan hanya akun yang kamu miliki/berwenang mengelolanya dan patuhi ketentuan WhatsApp.
- Sesi yang sudah tersimpan disambungkan kembali secara manual lewat `.jadibotlogin`; ini menghindari pembukaan banyak socket otomatis ketika server restart.
- Gunakan server dengan disk persisten. Storage serverless/ephemeral tidak cocok untuk menyimpan sesi Baileys jangka panjang.

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

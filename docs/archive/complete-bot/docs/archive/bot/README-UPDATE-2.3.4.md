# WhiskayBot v2.3.4 — Profile/Menu Image + Scrape

## Perubahan
- Profile card mengirim foto sebagai media WhatsApp terpisah dari kartu teks interaktif. Mode manual dan official tetap independen dari gambar menu.
- `PROFILE_CARD_IMAGE_URL` dan `MENU_IMAGE_URL` harus berisi URL gambar langsung yang bisa diakses publik (PNG/JPG/WEBP), bukan URL halaman web atau file yang membutuhkan login.
- `.profile image official` memvalidasi URL sebelum mengaktifkan mode official.
- `.profile image save` dan `.setmenu image save` menangani quoted media yang dibungkus ephemeral/view-once, mempertahankan ekstensi umum, dan memberi error lebih jelas.
- `.scrape <url>` mengambil judul, deskripsi metadata, dan cuplikan teks dari halaman publik HTML/plain-text. Dibatasi 1 MB dan 12 detik, tidak mengikuti redirect, serta menolak URL lokal/private yang umum.

## Contoh konfigurasi
```env
MENU_IMAGE_URL=https://example.com/whiskay-menu.png
PROFILE_CARD_IMAGE_URL=https://example.com/whiskay-profile.png
```
Ganti contoh URL dengan tautan gambar yang benar-benar milik owner dan dapat diakses publik.

## Contoh command
```text
.scrape https://example.com
.profile image
.profile image official
.profile image manual
.profile image save
.setmenu image
.setmenu image manual
.setmenu image save
.setmenu image official
```

## Catatan pengujian
Pemeriksaan sintaks dan integritas ZIP dijalankan saat paket dibuat. Belum dilakukan pengujian langsung pada sesi WhatsApp atau pada URL gambar server owner. Scrape menolak redirect dan membatasi ukuran respons, tetapi tetap sebaiknya digunakan hanya pada situs publik tepercaya.

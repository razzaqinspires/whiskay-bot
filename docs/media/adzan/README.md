# Audio Adzan untuk Whiskay Bot

Whiskay membaca dua file audio lokal (tidak mengunduh audio dari sumber eksternal):

- `subuh.mp3` — dipakai untuk salat Subuh.
- `umum.mp3` — dipakai untuk Zuhur, Asar, Magrib, dan Isya.

Letakkan kedua file di `media/adzan/` pada server bot. Alternatifnya, atur `ADZAN_AUDIO_DIR` di `.env` ke direktori absolut atau relatif terhadap root project. Maksimum ukuran masing-masing file 20 MB. File harus berupa MP3 yang dapat diputar oleh WhatsApp.

Jika file tidak ada, kosong, atau tidak tersedia, scheduler otomatis mengirim pengingat teks. Jika pengiriman audio gagal, scheduler mencoba mengirim teks sebagai fallback. Tidak ada file audio yang dibundel karena pemilik bot harus memastikan hak penggunaan/izin atas rekaman yang dipasang.

Preferensi tiap pengguna:

- `.adzan audio on` — audio aktif (default).
- `.adzan audio off` — hanya teks.
- `.adzan audio status` — status preferensi dan ketersediaan file.

File disimpan lokal, tidak dikirim ke pihak ketiga. Jangan menaruh file rahasia atau rekaman yang tidak memiliki izin distribusi di direktori ini.

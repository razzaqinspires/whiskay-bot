# Stage 51 Part 4 — WhatsApp Adzan Audio

## Scope

- Scheduler personal mengirim pesan audio MP3 via Baileys `sock.sendMessage` saat audio lokal tersedia.
- `subuh.mp3` dipakai untuk Fajr/Subuh; `umum.mp3` dipakai untuk Zuhur, Asar, Magrib, dan Isya.
- Preferensi audio per akun disimpan pada profil Adzan (`adzanAudioEnabled`), default aktif untuk profil lama maupun baru.
- Pengguna dapat mengubah preferensi melalui `.adzan audio on`, `.adzan audio off`, dan `.adzan audio status` di DM.
- Audio hilang, rusak, terlalu besar, atau gagal dikirim akan menghasilkan pengingat teks sebagai fallback.

## Deployment

Taruh audio yang memang boleh digunakan/distribusikan di `media/adzan/` atau atur `ADZAN_AUDIO_DIR`. Nama file harus tepat `subuh.mp3` dan `umum.mp3`; batas tiap file 20 MB. Tidak ada audio yang disertakan dalam ZIP karena operator harus memastikan hak penggunaan rekaman.

## Delivery behavior

- Audio dikirim sebagai file audio (`audio/mpeg`, `ptt: false`) dengan caption jadwal.
- Tidak ada audio otomatis dari internet atau upload ke layanan eksternal.
- Jika file tidak tersedia, pesan teks tetap dikirim.
- Persistent event claim masih bersifat at-most-once: crash setelah claim dan sebelum pengiriman dapat menyebabkan satu notifikasi terlewat. Mekanisme retry/outbox transaksional belum termasuk Part 4.

## Verification

`npm run verify:stage51-adzan-audio` menjalankan tes resolver file, mapping Subuh/umum, payload audio WhatsApp, preferensi audio off, fallback teks, dan penolakan prayer key tidak dikenal. Tes memakai buffer dummy dan mock `sock`; bukan uji kirim WhatsApp live.

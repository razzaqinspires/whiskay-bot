# Tahap 14 — Setup dan verifikasi

## Bot

1. Salin `.env.example` menjadi `.env` dan isi `OWNERS` dengan JID/nomor owner yang valid.
2. Jalankan `npm ci` lalu `npm test`.
3. Command: `.charge`, `.charge fast` (Premium), `.hit`, `.profile`, `.setpayment`, `.bukti`, `.status`, `.status antispam on|off`, `.status cooldown on|off`, `.premium @user 30`.
4. Atur metode: `.setpayment bank Nama|Nomor|Pemilik`, `.setpayment ewallet Nama|Nomor|Pemilik`, `.setpayment price 1000`, `.setpayment rate 1.01`. QRIS: reply gambar QRIS lalu `.setpayment qris` atau berikan path di dalam `data/`.
5. Template menu: `.setmenu template minimalist`, `.setmenu template cyberpunk`, `.setmenu template fantasy`. Detail biaya: `.setmenu energy on`; menu akan memberi peringatan bahwa detail energi memperlambat render.

## Web

1. Jalankan `npm ci`.
2. Jalankan `npm run verify:stage14`, `npm run verify:stage12-13`, lalu `npm run build`.
3. Bloom tersedia pada Graphics Quality `High`; kualitas `Low/Medium` tidak mengaktifkan composer bloom. Fishing, branching lore, dan resource gathering saat ini memakai state lokal Adventure dan belum disimpan sebagai inventory server yang otoritatif.

## Deployment caveats

- Uji WhatsApp/Baileys pada nomor test terlebih dahulu. Fitur forward media dapat berbeda menurut versi protokol.
- Premium harus diverifikasi manual sebelum diaktifkan. Jangan pernah mengaktifkan Premium hanya dari unggahan bukti tanpa pemeriksaan.
- Jalankan test database/WhatsApp dan build produksi sebelum mengganti deployment aktif.

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](../STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](../README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

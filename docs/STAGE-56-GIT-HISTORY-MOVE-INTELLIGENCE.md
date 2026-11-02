# Stage 56 — Git History & Move Intelligence

## Tujuan

Membuat `git upload` memahami file yang pernah staged, di-commit, dihapus, atau dipindahkan. Kasus utama: script lama di root dipindahkan ke `scripts/`, tetapi indeks Git atau commit lokal sebelumnya masih memperlihatkan jejak path lama.

## Alur validasi

1. Buat branch `upload/*`; branch `main` tidak pernah menjadi target push.
2. Baca commit yang belum ada pada `origin/<base>` (atau lima commit lokal terakhir bila tracking ref belum tersedia).
3. Tampilkan status staged/unstaged dengan deteksi rename Git (`--find-renames`).
4. Cari pasangan `./name.sh` dan `scripts/name.sh`. Bandingkan isi setelah normalisasi whitespace/baris kosong.
5. Jika kemiripan >= 65%, anggap perpindahan terkonfirmasi dan hapus hanya salinan legacy root; salinan canonical `scripts/` dipertahankan.
6. Jika kemiripan < 82%, jangan menghapus apa pun dan hentikan upload untuk review.
7. Buat snapshot aman, sinkronkan base, jalankan QA, staging, secret/private-data/whitespace checks, dan verifikasi ulang tidak ada root duplicate.
8. Commit dan push hanya ke branch `upload/*` untuk Pull Request.

## Batas keselamatan

- Pencocokan berdasarkan basename saja tidak cukup untuk penghapusan. Harus ada file canonical di `scripts/` dan skor konten >= 0.65.
- File root yang berbeda tidak disentuh. Jika ragu, sistem memilih berhenti daripada menghapus.
- Riwayat commit ditampilkan sebagai konteks audit; tidak ada amend/rebase/reset terhadap commit pengguna.
- File runtime, session, database, credential, dan secret tetap dilindungi oleh Stage 53.
- Git mendeteksi rename berdasarkan similarity saat staging (`git diff --cached --find-renames`); nama commit tetap menyimpan satu perubahan rename/delete-add, bukan dua salinan.

## Perintah

- `npm run audit:git-intelligence` — analisis riwayat dan rekonsiliasi pasangan root/scripts.
- `npm run verify:stage56` — uji fixture Git sementara, termasuk pasangan mirip dan pasangan berbeda.
- `npm run git:upload` — jalur sekali klik dengan seluruh pemeriksaan berurutan.

Jika ditemukan pasangan ambigu, selesaikan secara manual lalu jalankan ulang upload. Jangan memaksa `git add -A` atau menghapus path yang dilaporkan.

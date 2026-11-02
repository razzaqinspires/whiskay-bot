# Stage 57 — Git Commit Lineage & Recovery Intelligence

## Masalah yang diperbaiki

- `git upload` sebelumnya hanya menerima branch `main`. Setelah upload terhenti pada `upload/*`, menjalankan ulang perintah justru ditolak sehingga pengguna harus mengelola branch secara manual.
- Uji Stage 53 menganggap `data/dungeon/floors.json` wajib tidak ada secara fisik. Pada mesin pemilik, salinan runtime/legacy yang di-ignore dapat tetap ada. Pengujian tidak boleh meminta penghapusan data lokal.

## Perilaku baru

1. Dari `main`, buat branch upload baru seperti biasa.
2. Dari branch `upload/*`, lanjutkan branch yang sedang aktif; jangan membuat branch kedua, jangan menghapus branch lama, dan jangan menggandakan snapshot jika working tree sudah bersih.
3. Branch selain base (`main`) dan `upload/*` tetap ditolak untuk mencegah upload branch automation/arsip yang tidak disengaja.
4. `scripts/git-upload-recovery.mjs` membandingkan merge-base, jumlah commit ahead/behind, dan `git cherry` patch-id untuk menemukan commit yang patch-nya sudah terwakili di base.
5. Sebelum publish, mode `--check-publish` menghentikan upload jika tidak ada commit baru atau semua patch pending sudah ada di base, sehingga tidak membuat PR kosong. Branch tetap disimpan.
6. Audit recovery bersifat read-only. Ia tidak melakukan reset, rebase, amend, cherry-pick, force-push, atau penghapusan commit.
7. Analisis dijalankan sebelum snapshot dan sesudah sinkronisasi base. Konflik merge tetap menghentikan proses dan mempertahankan branch upload.
8. Stage 53 memvalidasi bahwa definisi dungeon canonical ada di `assets/` dan path privat `data/dungeon/floors.json` tidak dilacak Git. Salinan lokal yang di-ignore boleh tetap ada dan tidak disentuh.

## Perintah

- `npm run audit:git-recovery` — audit lineage dan status pemulihan branch aktif.
- `npm audit --json` — tampilkan paket, severity, rentang versi terdampak, dan status perbaikan yang disediakan npm.
- `npm run verify:stage57` — uji lineage, resume branch, dan sifat non-destruktif.
- `npm run git:upload` — dari `main` memulai upload; dari `upload/*` melanjutkan upload yang terhenti.

## Batas keselamatan

- Resume hanya berlaku untuk branch bernama `upload/*`.
- Tidak ada penghapusan commit yang sudah dibuat.
- Patch-equivalent commits hanya dilaporkan; tidak di-rewrite otomatis.
- File lokal `data/`, sesi, database, dan credential tetap dipertahankan serta dikecualikan dari upload.
- Upload tetap branch-only dan PR-only; `main` tidak pernah menjadi target push langsung.

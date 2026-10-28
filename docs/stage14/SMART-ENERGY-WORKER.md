# Smart Energy Worker — Tahap 14

## Model komputasi

- Tidak memanggil LLM untuk setiap command. Worker menggunakan heuristik deterministik sehingga tidak menambah biaya API, latensi jaringan, atau proses worker thread.
- Input perintah dibatasi 1.200 karakter; maksimal 160 token dipakai dalam perhitungan. Riwayat kemiripan dibatasi lima perintah terakhir per pengguna.
- Perkiraan kompleksitas memakai jumlah token, variasi token, operator matematika/kata hitung, tanda kutip, dan Jaccard similarity. Biaya dinamis dibatasi 0,25–8,75% dan dibulatkan dua desimal. Plugin dapat mendeklarasikan biaya statis.
- Data persisten menggunakan JSON atomik dalam `data/`; pembaruan read-modify-write dalam satu proses diserialisasi. Maksimal 5.000 entri energi disimpan.
- Middleware fail-open jika ledger tidak dapat ditulis: command tetap berjalan dan error dicatat ke log. Ini menjaga bot tetap tersedia, tetapi berarti pencatatan energi mungkin terlewat saat disk penuh/readonly.

## RAM dan latensi

Kompleksitas algoritma per command O(n) dengan batas panjang input; operasi disk menjadi komponen latensi utama. Tidak ada interval/timer permanen atau worker thread. Saklar runtime dicache selama dua detik. Pengukuran RSS/heap ditampilkan melalui `.status`.

## Kebijakan ekonomi

- Energi awal 100,00%. Pengurangan energi adalah metrik dan bukan hard quota; command tidak ditolak hanya karena energi 0%.
- `.charge` mengisi +40% dengan cooldown 24 jam. `.charge fast` hanya Premium aktif dan mengisi hingga 100%.
- Premium dapat diberikan owner maksimal 30 hari per pemberian. Bukti pembayaran dikirim ke owner untuk verifikasi manual; sistem tidak menyatakan pembayaran otomatis terverifikasi.
- Harga harian dihitung dari harga dasar dan rate yang dapat disetel owner. Integrasi payment gateway otomatis belum termasuk.

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](../STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](../README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

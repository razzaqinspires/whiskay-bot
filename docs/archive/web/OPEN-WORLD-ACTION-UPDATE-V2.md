# WHISKAY RPG Open World Action Update v2

## Perubahan
- Memperbaiki mapping joystick camera-relative: dorong ke atas selalu bergerak ke arah depan kamera, bukan mundur.
- Menambahkan tombol mobile Jump, Sprint, Attack, Block, dan Loot/Interact.
- Menambahkan siklus waktu otomatis (day/night) dan cuaca yang berganti secara otonom.
- Menambahkan rumah desa low-poly dan koin fisik yang bisa dipungut dalam radius interaksi.
- Menampilkan waktu, kondisi cuaca, dan jumlah Gold pada HUD.
- Mempertahankan FPS overlay, quality selector, UI map/quest, preload, dan API App Router.

## Uji mapping
Jalankan `npm run verify:joystick` untuk menjalankan enam mock-test arah gerak.

## Catatan
Aksi combat dan loot masih merupakan prototipe client-side; tidak ada authoritative multiplayer/server combat. Cuaca dan waktu lokal berjalan pada tab yang aktif. Build Next.js dan uji perangkat nyata perlu dilakukan pada preview deployment.

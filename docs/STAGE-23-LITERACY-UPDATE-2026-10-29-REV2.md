# Stage 23+ — Literasi Update Rev. 2 (29 Oktober 2026)

Dokumen ini adalah addendum Stage 23; tidak menggantikan arsip Stage 1–22 atau laporan Stage 23 sebelumnya.

## Literasi 1 — `ctx.reply` vs `ctx.send`
- `ctx.reply(text)` khusus mengirim teks dengan quote pesan pemicu.
- `ctx.send(options)` adalah builder terpisah: mendukung teks, media, `buttons`/interactive, list sections, rich message, dan table melalui helper socket yang telah disediakan `serializer-compat.cjs`.
- `serializer-compat.cjs` tidak diubah. Wrapper mengandalkan `sendInteractive`, `sendTable`, `sendRichMessage`, dan `sendList` yang disediakan compatibility layer.
- Contoh: `ctx.send({text:'Halo'})`, `ctx.send({media:buffer, mediaType:'image', text:'Caption'})`, `ctx.send({type:'table', title:'Harga', headers:['Item','Harga'], rows:[['Mod Coin','Rp...']]})`, `ctx.send({buttons:[{name:'quick_reply',title:'Status',id:'.statusbaterai'}],text:'Pilih'})`.

## Literasi 2 — Setmenu, font energi, kanvas, baterai
- `.setmenu battery match_menu|default` mengatur baris energi khusus di `.menu` saja. Ini tidak menyebarkan font menu ke command lain.
- `.setmenu notification hide|merge|separate` mengatur notifikasi pemakaian energi: hilang, digabung di bawah balasan, atau bubble kedua.
- Font tambahan `bolditalic` dan `square` terdaftar.
- Menu gambar kini menawarkan Official Menu V1/V2 dan Profile RPG V1/V2, selain gambar manual dan nonaktif.
- `.setenergy reset [nomor-user/@tag]` adalah perintah owner. Tanpa target, reset baterai akun owner yang menjalankan; dengan nomor/JID, reset akun target. Mode charging dihentikan dan volt kembali 5V. Sinkronisasi dashboard dilakukan best-effort.
- Fast charging tetap membutuhkan Premium dan Koin Mod; `.charge upgrade` meningkatkan kapasitas 50 poin dengan harga 100 Koin Mod.
- `.statusbaterai`, `.newcmd`, dashboard/paginasi dan harga ekonomi didokumentasikan dalam laporan Stage 23 utama. Harga pembelian Mod Coin perlu mengikuti konfigurasi rate/payment aktif dan pembayaran harus diverifikasi manual sebelum kredit.

## Literasi 3 — Sinkronisasi RPG
Schema Supabase dan `/api/sync` pada Companion sudah memiliki `mod_coins`, `max_battery_capacity`, dan `current_volt_speed`. Bot memicu sinkronisasi setelah charge/upgrade/reset, tetapi konektivitas live dan realtime harus diuji dengan kredensial Supabase deployment.

## Literasi 4 — UI Companion
Komponen Stage 23 terkait baterai, shop, dan world event tetap dipertahankan. V2 canvas memakai pipeline canvas resmi yang tersedia dan mendukung avatar/profile image dari sumber yang terkonfigurasi; perbedaan visual final perlu diverifikasi pada perangkat WhatsApp karena renderer/preview berbeda antarklien.

## Literasi 5 — Mega Autonomous Awareness
Context injector dan kontrak event merupakan fondasi. Scheduler global, analisis sentimen proaktif, dan publikasi Darkness Event otomatis belum boleh dianggap aktif tanpa deployment worker/event broker, pengujian frekuensi, dan uji end-to-end.

## Verifikasi
- `node --check src/core/serializer.js`
- `node --check src/plugins/general/setmenu.js`
- `node --check src/plugins/general/menu.js`
- `node --check src/plugins/owner/energy-system.js`
- `node --check src/lib/energy-worker.js`
- `npm run verify:stage23`
- Companion: `npm run verify:all`

Catatan: pemeriksaan statis tidak membuktikan pembayaran, pengiriman pesan langsung, deployment, atau Supabase Realtime live.

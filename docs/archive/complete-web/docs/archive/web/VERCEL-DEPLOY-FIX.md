# Perbaikan deployment Vercel

Project ini menggunakan Next.js App Router. File `app/page.jsx` adalah homepage `/`,
`app/dungeon/page.jsx` adalah `/dungeon`, dan `app/inventory/page.jsx` adalah `/inventory`.

## Pengaturan Vercel
- Root Directory: `.` (folder yang berisi `package.json` dan folder `app/`).
- Framework Preset: `Next.js`.
- Build Command: biarkan default Next.js atau `npm run build`.
- Output Directory: kosongkan/default; jangan isi `public`, `out`, atau `dist`.
- Install Command: default atau `npm install`.
- Pastikan `app/`, `components/`, `lib/`, `public/`, `package.json`, dan `next.config.mjs` ada di root yang dipilih.
- Deploy ulang dari Production setelah menyimpan pengaturan.

`vercel.json` tidak lagi memaksa `/dungeon` dan `/inventory` ke file HTML prototipe lama; Next.js menangani route tersebut.

## Environment variables
File `.env` lokal tidak disertakan dalam ZIP ini untuk mencegah kebocoran secret. Jika integrasi database/bot digunakan, tambahkan `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, dan `BOT_SYNC_TOKEN` melalui Vercel Project Settings → Environment Variables. Jangan gunakan prefix `NEXT_PUBLIC_` untuk secret.

## Fix EEXIST `/api/floors`

Next.js App Router is the sole owner of API routes. The legacy root-level `api/*.js` serverless functions were removed because they duplicated `app/api/*/route.js` endpoints and caused Vercel to attempt to create the same `/api/floors` function twice. Keep `app/api/floors/route.js`, `app/api/player/route.js`, and `app/api/sync/route.js` as the only owners. Each route explicitly uses `dynamic = 'force-dynamic'` (floors also sets `revalidate = 0`) so Vercel does not create a competing static route output.

The sync endpoint accepts `BOT_SYNC_TOKEN` or `DUNGEON_SYNC_TOKEN` for backward compatibility with WhiskayBot. Prefer setting one identical secret on both deployments.

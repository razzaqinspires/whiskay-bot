# WhiskayBot v2.3.9

## YouTube interactive list correction

- Replaced the text-only search output with a native `single_select` list using the same `sections` / `rows` / row `id` structure used by `.menu` and `.setmenu`.
- Search results use row IDs routed to `.ytpreview pick N`; selecting a row opens the video preview and format choices.
- Search results and current page are cached per chat + sender so `.ytpreview` can reopen the current result picker and `.ytpage`, `.ytpage next`, and `.ytpage prev` navigate the active query without repeating the query text.
- The search card keeps `Putar Hasil Pertama`, a native `Daftar Hasil` list, and a page-navigation quick reply.
- Native interactive sends still rely on the existing `src/lib/interactive.js` serializer helper and its text fallback when relay fails.

## Validation

Syntax checks and ZIP integrity are run locally. A live WhatsApp test is still required to confirm native list rendering on the exact Baileys 7.0.0-rc14 and WhatsApp client combination in use.

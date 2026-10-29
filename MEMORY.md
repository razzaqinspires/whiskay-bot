# MEMORY.md — Memori Arahan Stage Whiskay

- Audit source/repo aktual sebelum mengubah apa pun; jika tidak tersedia, minta source/tree/diff dan jangan mengarang analisis.
- Gunakan 5 literasi × 5 kategori × 10 subkategori (250 item) pada setiap stage, dan tandai rencana vs implementasi/test/bukti secara jujur.
- Setiap perubahan wajib memperbarui README, CHANGELOG, dokumentasi stage, test/QA, dan catatan bukti.
- Dokumentasikan formula energi, sumber konsumsi, regenerasi, cooldown, batas, error handling, dan test case.
- Dokumentasikan Coin Mod: definisi, command, konfigurasi, efek ekonomi/energi, migrasi, test, changelog, bukti. Bedakan Coin Mod dari Gold RPG, Premium, Limit, dan uang fiat.
- Jangan klaim payment gateway, ads, affiliate, subscription, database transaksi, atau integrasi live aktif tanpa bukti source dan test/runtime.
- ZIP harus memuat source dan riwayat docs, lolos tes/integrity, dan mengecualikan `.env`, session, data runtime, serta `node_modules`.
- Catat impact, effort, risk, alasan, file/fungsi, dampak ke fitur lama, mitigasi, dan rollback.


## Stage 32 work memory
- Always inspect the delivered repository archive before edits. In the Stage 31 source, `src/core/serializer.js` imports `src/core/serializer-compat.cjs`; there is no `serializer-compact.cjs`.
- Keep full menu template, widget-specific design, and before/after symbols as three independent settings.
- Interactive setting confirmations should retain navigation controls; use list buttons for secondary actions and at most three quick replies per message.
- At zero energy, block chargeable commands before plugin execution while leaving recovery/status commands available.
- Leveling uses local JSON keyed by `group|user`; serialize writes in-process, but document that this does not solve multi-instance transactions.
- Owner global defaults are a baseline; preserve per-user overrides. Never erase RPG XP/economy during display-setting reset.


## Stage 33 work memory
- Compare source repository command inventory against Whiskay registry before porting; preserve existing equivalents instead of duplicating command names.
- Prefer an original ESM plugin using `ctx.reply`/`ctx.sendInteractive` over copying legacy CommonJS source or third-party response style.
- Do not port view-once extraction/anti-delete content exposure, sudo escalation, embedded API keys, or runtime toggles without an explicit security/consent review.
- Public API integrations need bounded inputs, timeouts, clear source attribution, user-facing failure paths, and tests of helpers independent from live network access.
- Button session IDs must be checked against current sender+chat context and expiry; ephemeral RAM sessions must be documented as non-durable.


## Stage 34 guardrails
- Keep Lit 6 owner-supplied backlog as the source of truth; do not replace it with generated ideas.
- No uncontrolled globals; scheduler state is instance-owned and jobs must declare `{name, intervalMs, run}`.
- Energy commands must pass preflight affordability before plugin execution. Control/recovery commands are zero-cost; do not clamp cost down to remaining energy and then run the command.
- Energy Saver unlocks below 20%; cost reduction is paired with longer cooldown and persisted per user.
- SyntaxDoctor/self-healing may diagnose and quarantine logically but must not mutate source code automatically. Owner review + tests are required before applying patches.
- NSFW is disabled by default and global pause/critical workload lock take precedence; Stage 34 only provides policy scaffolding.
- Reminder delivery can duplicate after crash between send and persistence; do not claim exactly-once delivery.
- Experimental-Bell integrations must use the Feature Gap Ledger and Event Shell Adapter; compose existing Whiskay behavior instead of cloning.

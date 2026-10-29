# Stage 36 revisi — Literasi 1–5 berdasar audit script aktual

Tanggal: 29 Oktober 2026. Basis: Whiskay Bot `2.23.0` workspace dan upload `Experimental-Bell-master.zip` (snapshot 5 September 2026). Daftar subkategori adalah backlog audit yang dihasilkan dari struktur file dan perbandingan nyata; status **AUDIT** berarti belum menyatakan fitur sudah lengkap.

## Temuan paling penting dari Whiskay

- `src/core/PluginManager.js`: plugin direload dengan map baru dan swap atomik; tetapi validasi duplikasi command masih mengganti alias command dari plugin lain secara diam-diam (`newCmd.set`). Harus ada diagnostik konflik.
- `src/core/CommandHandler.js`: akses owner/group/premium/registrasi/NSFW/quarantine dan XP disatukan; error `p.execute` ditangani, tetapi error sebelum/dalam policy tertentu perlu observabilitas yang konsisten. Typo saran benar-benar aktif pada command tak dikenal.
- `src/core/serializer-compat.cjs`: permukaan kompatibilitas besar; wajib kontrak regression agar helper baru tidak memecahkan payload tombol/list dan fallback teks.
- `src/lib/app-database.js`: serialisasi tulis berbasis antrean, backup dan file temp; tetap JSON satu file, sehingga throughput lintas proses dan lock multi-worker merupakan risiko.
- `src/lib/leveling.js` + `src/handlers/message.js`: XP pesan grup baru aktif bila admin/owner menyalakan `.leveling on`; XP command diperoleh setelah command sukses dan ada cooldown 15 detik per command key. Ini bukan XP untuk setiap pesan dan sengaja membatasi farming.
- Game tersedia sebelum revisi: catur, Tic-Tac-Toe, slot, truth/dare, pet, dan berbagai plugin RPG; tidak ditemukan plugin Werewolf dalam `src/plugins` sebelum penambahan Stage 36.
- `Experimental-Bell/helpers/Events/werewolf.js` terhubung ke `machine/werewolf.js`; mencakup room create/join/start, fase malam/siang, role privat, Mayor, vote, dan helper skill. Ini mengonfirmasi Werewolf sebagai gap yang bermakna, bukan hanya perkiraan berdasarkan nama.

## Literasi 1 — Arsitektur, event, dan lifecycle

### A. Plugin dan command routing
1. **AUDIT** Konflik command saat loader membangun map.
2. **AUDIT** Diagnostik alias duplikat.
3. **AUDIT** Kontrak manifest command.
4. **AUDIT** Validasi field plugin wajib.
5. **AUDIT** Validasi role/policy plugin.
6. **AUDIT** Konsistensi kategori menu.
7. **AUDIT** Batas jumlah plugin.
8. **AUDIT** Penanganan plugin gagal import.
9. **AUDIT** Atomisitas reload dalam kondisi error.
10. **AUDIT** Audit trail reload.

### B. Event Registry dan helper compatibility
11. **ADA** Explicit EventRegistry untuk fitur baru.
12. **ADA** Guard kedalaman dispatch event.
13. **ADA** Required-argument guard.
14. **ADA** Mention dan quoted-message guards.
15. **ADA** Premium dan game-context guards.
16. **ADA** URL host allow-list.
17. **ADA** Metadata media normalization.
18. **AUDIT** Registry belum menjadi jalur utama seluruh plugin.
19. **AUDIT** Kontrak legacy `ev.on` versus plugin schema.
20. **AUDIT** Hasil `emit` perlu mapping response yang konsisten.

### C. Context dan serializer
21. **AUDIT** Satu kontrak context untuk group dan DM.
22. **AUDIT** Alias sender JID/LID pada semua plugin.
23. **AUDIT** Normalisasi mention lintas library version.
24. **AUDIT** Quoted message ephemeral/view-once.
25. **AUDIT** Payload media dan batas ukuran.
26. **AUDIT** Payload tombol quick-reply.
27. **AUDIT** Payload single-select list.
28. **AUDIT** Fallback teks untuk klien WhatsApp lama.
29. **AUDIT** Normalisasi interactive response IDs.
30. **AUDIT** Regression serializer saat update Baileys.

### D. Lifecycle dan runtime
31. **ADA** Atomic plugin map swap.
32. **ADA** Watcher/hot reload.
33. **ADA** Restart manager.
34. **ADA** Persistent runtime state.
35. **ADA** Chronos/job loader.
36. **AUDIT** Shutdown bersih semua timer.
37. **AUDIT** Recovery job setelah restart.
38. **AUDIT** Health readiness versus liveness.
39. **AUDIT** Multi-process coordination.
40. **AUDIT** Versioned migration untuk runtime state.

### E. Integritas dan kinerja
41. **ADA** Antrean tulis database JSON dalam satu proses.
42. **ADA** Backup file JSON dan atomic rename.
43. **AUDIT** Lock lintas proses.
44. **AUDIT** SQLite/PostgreSQL backend untuk pertumbuhan data.
45. **AUDIT** Batas ukuran database dan ledger.
46. **AUDIT** Backpressure untuk ledakan event.
47. **AUDIT** Timeout command terstandar.
48. **AUDIT** Cancellation untuk pekerjaan media.
49. **AUDIT** Idempotency key untuk command ekonomi.
50. **AUDIT** Migrasi schema teruji.

## Literasi 2 — UX, interaktivitas, lokalisasi, dan media

### A. Respons dan bahasa
51. **ADA** Locale helper Indonesia/Inggris.
52. **AUDIT** Semua respons command memakai katalog locale.
53. **AUDIT** Template error standar.
54. **AUDIT** Format pesan error aman untuk pengguna.
55. **AUDIT** Nama tombol dibatasi panjang klien.
56. **AUDIT** Bahasa per grup.
57. **AUDIT** Bahasa preferensi per pengguna.
58. **AUDIT** Variabel template tervalidasi.
59. **AUDIT** Uji karakter emoji/non-BMP.
60. **AUDIT** Fallback locale tidak diketahui.

### B. Tombol dan daftar
61. **AUDIT** Batas tombol per pesan.
62. **AUDIT** Pagination list untuk hasil panjang.
63. **AUDIT** Token tombol kedaluwarsa.
64. **AUDIT** Verifikasi pengklik adalah pemain yang benar.
65. **AUDIT** Nonce untuk aksi sensitif.
66. **AUDIT** Proteksi replay tombol lama.
67. **AUDIT** Kontrak quick-reply dan single-select.
68. **AUDIT** Pengelolaan pesan papan/game yang diperbarui.
69. **AUDIT** Fallback bila media gagal terkirim.
70. **AUDIT** Tombol tidak menyiratkan aksi yang gagal.

### C. Media dan converter
71. **ADA** Downloader TikTok.
72. **ADA** Downloader Instagram.
73. **ADA** Downloader Facebook.
74. **ADA** YouTube tooling.
75. **ADA** Sticker maker.
76. **AUDIT** Bandingkan command converter sumber satu per satu.
77. **AUDIT** Validasi MIME lewat byte, bukan hanya metadata.
78. **AUDIT** Batas byte dan durasi unduhan.
79. **AUDIT** FFmpeg availability check.
80. **AUDIT** Timeout dan cleanup proses FFmpeg.

### D. Maker dan pencarian
81. **ADA** Meme/image tooling dasar.
82. **ADA** Anime search.
83. **ADA** GitHub search tooling.
84. **ADA** Scrape tools.
85. **AUDIT** Maker template parity.
86. **AUDIT** OCR capability parity.
87. **AUDIT** Provider search fallback.
88. **AUDIT** Rate limit provider eksternal.
89. **AUDIT** Penanganan URL malformed/redirect.
90. **AUDIT** Cache metadata dan hasil pencarian.

### E. Interaksi sosial dan user experience
91. **ADA** Anonymous pairing.
92. **ADA** Menfess.
93. **ADA** Truth/dare.
94. **AUDIT** Relationship command parity.
95. **AUDIT** Reaction mapping dan cooldown.
96. **AUDIT** AFK status dan mentions.
97. **AUDIT** Welcome/leave template parity.
98. **AUDIT** Privasi DM dan anti-spam.
99. **AUDIT** Accessibility respons tanpa gambar.
100. **AUDIT** UX error recovery dan command retry.

## Literasi 3 — Fitur command, AI, game, RPG, dan admin

### A. AI dan provider
101. **ADA** AI chat dasar.
102. **ADA** Image generation entrypoint.
103. **AUDIT** Provider parity per model/provider.
104. **AUDIT** Vision/media prompts.
105. **AUDIT** Speech/transcription.
106. **AUDIT** TTS generation.
107. **AUDIT** Tool-call allow-list.
108. **AUDIT** Provider fallback matrix.
109. **AUDIT** Key rotation tanpa log rahasia.
110. **AUDIT** Biaya dan kuota per pengguna.

### B. Game sosial
111. **ADA** Catur dengan chess.js.
112. **ADA** Tic-Tac-Toe.
113. **ADA** Slot.
114. **ADA** Truth/dare.
115. **ADA** Pet game.
116. **BARU—MVP** Werewolf state machine.
117. **AUDIT** Werewolf role balance.
118. **AUDIT** Werewolf phase timer.
119. **AUDIT** Werewolf private-room binding.
120. **AUDIT** Werewolf mayor vote weight.

### C. Werewolf mechanics
121. **ADA—MVP** Room create/join/leave/start.
122. **ADA—MVP** Private role assignment.
123. **ADA—MVP** Day voting and tally.
124. **ADA—MVP** Night action validation.
125. **ADA—MVP** Protection and heal resolution.
126. **AUDIT** Hunter after-death trigger.
127. **AUDIT** Witch one-potion-per-night rules.
128. **AUDIT** Traitor conversion edge cases.
129. **AUDIT** Lycan inspection semantics.
130. **AUDIT** Game recovery and state reconciliation.

### D. RPG dan ekonomi
131. **ADA** RPG daily reward.
132. **ADA** Shop/buy.
133. **ADA** Gacha.
134. **ADA** Craft.
135. **ADA** Trade.
136. **ADA** Guild.
137. **ADA** Auction.
138. **ADA** Web RPG sync.
139. **AUDIT** Experimental-Bell RPG effect mapping.
140. **AUDIT** Prevent double-spend and duplicate rewards.

### E. Group, owner, utilities
141. **ADA** Group moderation commands.
142. **ADA** Group safety/anti-link.
143. **ADA** Owner ops center.
144. **ADA** Hot reload controls.
145. **ADA** Jadibot management.
146. **AUDIT** Individual source `group.js` command parity.
147. **AUDIT** Individual source `owner.js` command parity.
148. **AUDIT** Source `others.js` command parity.
149. **AUDIT** Source `tools.js` command parity.
150. **AUDIT** OTA update trust model and rollback.

## Literasi 4 — Kualitas, keselamatan, observabilitas, dan deployment

### A. Testing
151. **ADA** Node built-in test runner.
152. **ADA** Stage verification scripts.
153. **AUDIT** Every plugin has basic behavior tests.
154. **AUDIT** Negative permission tests.
155. **AUDIT** Property tests for state machines.
156. **AUDIT** Fuzz malformed commands.
157. **AUDIT** Regression snapshots for interactive payloads.
158. **AUDIT** Load test simultaneous messages.
159. **AUDIT** Restart/recovery tests.
160. **AUDIT** Dependency vulnerability review.

### B. Security and moderation
161. **ADA** Owner/group/premium central gates.
162. **ADA** NSFW access policy scaffold.
163. **ADA** URL host boundary validation in helper.
164. **AUDIT** SSRF protection in every URL-fetch path.
165. **AUDIT** Prevent command injection into subprocesses.
166. **AUDIT** Remove arbitrary eval-like capabilities from non-owner paths.
167. **AUDIT** Restrict owner shell to explicit authorization.
168. **AUDIT** Ensure no secret or auth files in archives.
169. **AUDIT** Retention and deletion policy for user data.
170. **AUDIT** Privacy test for private roles/DM.

### C. Observability
171. **ADA** Structured logger.
172. **ADA** Message/command counters.
173. **ADA** WorkloadTracker.
174. **ADA** Failure quarantine shard.
175. **AUDIT** Correlation ID in all command logs.
176. **AUDIT** Redact phone IDs and prompts where possible.
177. **AUDIT** Histogram command latency.
178. **AUDIT** Per-provider error/latency metrics.
179. **AUDIT** Alert threshold definitions.
180. **AUDIT** Stage dashboard ties to real data sources.

### D. Runtime and deployment
181. **ADA** Node engine constraint.
182. **ADA** PM2 ecosystem file.
183. **ADA** Config `.env.example`.
184. **AUDIT** Clean shutdown and restart test.
185. **AUDIT** Node 20+ and ARM64 runtime validation.
186. **AUDIT** Dependency native module compatibility.
187. **AUDIT** Lockfile reproducible install.
188. **AUDIT** Build/test in clean container.
189. **AUDIT** Restore from backup rehearsal.
190. **AUDIT** Deployment rollback checklist.

### E. Licensing and source parity
191. **ADA** Source archive inspected.
192. **ADA** MIT notice documented.
193. **AUDIT** Per-file attribution when actual code is reused.
194. **AUDIT** API-provider terms check.
195. **AUDIT** Media copyright review.
196. **AUDIT** Keep original dependencies pinned or consciously replace.
197. **AUDIT** Generate exact source-to-target traceability.
198. **AUDIT** Record version and commit/archive hash.
199. **AUDIT** Label parity complete only after test evidence.
200. **AUDIT** Keep unimplemented features visible, not implied as shipped.

## Literasi 5 — Source parity roadmap and stage gates

### A. Source inventory
201. **ADA** `helpers/` source inventory.
202. **ADA** `helpers/Events/` source inventory.
203. **ADA** `machine/werewolf.js` identified as separate dependency.
204. **AUDIT** AST extraction of every event command.
205. **AUDIT** Alias and dynamic command extraction.
206. **AUDIT** Commands hidden behind config flags.
207. **AUDIT** Provider-only command inventory.
208. **AUDIT** Runtime-only menu commands.
209. **AUDIT** Source helper dependency graph.
210. **AUDIT** Whiskay target file mapping for each command.

### B. Helper parity
211. **ADA** Event dispatch adapter.
212. **ADA** Required args guard.
213. **ADA** Mention/quoted guard.
214. **ADA** Premium/game context guard.
215. **ADA** URL allow-list normalizer.
216. **ADA** Media metadata normalizer.
217. **AUDIT** Event emitter lifecycle parity.
218. **AUDIT** Stub type message parity.
219. **AUDIT** Interactive helper parity.
220. **AUDIT** Jadibot multi-slot isolation parity.

### C. Events modules
221. **AUDIT** `about.js` full command coverage.
222. **AUDIT** `ai.js` full provider/media coverage.
223. **AUDIT** `converter.js` command-by-command coverage.
224. **AUDIT** `downloader.js` provider-by-provider coverage.
225. **AUDIT** `game.js` each game mechanic coverage.
226. **AUDIT** `group.js` permission parity.
227. **AUDIT** `maker.js` generator parity.
228. **AUDIT** `others.js` feature and data-privacy parity.
229. **AUDIT** `owner.js` utility and security parity.
230. **AUDIT** `relationship.js` social command coverage.

### D. Remaining Events and systems
231. **AUDIT** `rpg.js` economy and survival parity.
232. **AUDIT** `search.js` provider coverage.
233. **AUDIT** `tools.js` utility coverage.
234. **AUDIT** `tts.js` compatible TTS implementation.
235. **BARU—MVP** `werewolf.js` plus engine integration.
236. **AUDIT** `wwpc.js` safe private command routing.
237. **AUDIT** `reloadevents.js` targeted reload semantics.
238. **AUDIT** `machine/chess.js` source feature comparison.
239. **AUDIT** `machine/livechart.js` realtime functionality decision.
240. **AUDIT** dashboard/update helpers applicability.

### E. Delivery gates
241. **AUDIT** Each source command has a target status: EXISTING/PARTIAL/MISSING/INCOMPATIBLE.
242. **AUDIT** Each partial mapping has a named gap and test.
243. **AUDIT** Feature parity table is backed by tests.
244. **AUDIT** Third-party notice verified against source license.
245. **AUDIT** No source secrets/database/auth copied.
246. **AUDIT** Tests pass after every family migration.
247. **AUDIT** Interactive behavior checked on WhatsApp.
248. **AUDIT** Failure fallback to plain text documented.
249. **AUDIT** Deployment instructions match real package scripts.
250. **AUDIT** Release note differentiates implemented, partial and planned.

## Recommendation to prioritize next

1. Complete Werewolf correctness: private room lookup, timed day/night phases, Mayor weight, hunter trigger, witch potion limit and durable timer recovery.
2. Generate command-level parity inventory from source AST and the Whiskay command map, then fill `MISSING` in family order: Werewolf + games, converters/TTS, search/tools, social, owner/other commands.
3. Add tests for permission boundaries, invalid inputs, concurrent room actions, persistent restart and WhatsApp button round trips.
4. Keep all source feature statuses honest: `EXISTING`, `PARTIAL`, `MISSING`, `INCOMPATIBLE`, `IMPLEMENTED-UNVERIFIED`.

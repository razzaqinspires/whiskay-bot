# Stage 25 — Repository Identity, Menfess, GitHub Suite, World Sync, Mega AI

**Status:** implementation foundation + documented integration contracts. Do not treat every design item as production-complete. Previous Stage 1–24 docs and archives remain authoritative history.

## Literasi 1 — Metadata and repository synchronization (5 categories)
1. `config/repository.json` records developer identity and cross-project repository URI placeholders. Replace placeholders with verified public URLs/contact before release; never invent credentials.
2. `package-lock.json` remains the reproducible dependency source. Core Baileys is exact-pinned; review all transitive versions before dependency upgrades.
3. `ecosystem.config.cjs` and `start:pm2`/`restart:pm2`/`stop:pm2`/`logs:pm2` add optional PM2 lifecycle management. Install PM2 on the host separately.
4. Web root metadata includes title, description, author, Open Graph, canonical URL and `NEXT_PUBLIC_SITE_URL` configuration.
5. `.env.example` documents cross-repository URLs. Copy actual secrets independently into Termux and hosting secret stores; do not sync secrets by committing `.env`.

## Literasi 2 — Menfess Engine (5 categories)
1. `src/services/menfessEngine.js` stores isolated RAM sessions with random 128-bit hex IDs, participants, alias and expiry.
2. `resolveMenfessReply()` resolves quoted stanza IDs through a message index and authorizes only the two session participants.
3. `recordMenfessMessage()` stores the outgoing WhatsApp message ID returned by Baileys.
4. `endMenfessSession()` terminates and clears session/message/entity indexes; `.menfess end <id>` notifies both participants.
5. Phone normalization, active-session collision checks, a per-sender rate gate and 24-hour TTL are implemented. Important: automatic global quote interception must be wired into the central message middleware before claiming end-to-end anonymous replies; current plugin only establishes the service/command foundation.

Commands: `.menfess help`, `.menfess send <nomor> <pesan>`, `.menfess end <id-sesi>`.

## Literasi 3 — GitHub Suite (5 categories)
1. Existing `.github`/`.github commits`/`.github issues`/`.github workflows` are retained.
2. Issue creation should validate repo allowlists and title/body length before POSTing; do not accept arbitrary repository targets from untrusted users.
3. Workflow dispatch requires an owner-only command, an allowlisted workflow/ref and a token with minimum Actions permission.
4. Repository metrics must use current API values and may be rendered as media only when a real renderer exists; do not fabricate canvas screenshots.
5. Webhooks must verify `X-Hub-Signature-256` against the raw request body, deduplicate delivery IDs, then forward allowlisted events. The current World Boss webhook is not a generic GitHub webhook.

## Literasi 4 — Web Companion integration (5 categories)
1. `schema.sql` includes server-owned `world_external_events` and `world_economy_ticks` tables with RLS enabled and no public write policy.
2. Weather and world seed should come from validated server snapshots, not client-authored values.
3. Pet growth events should update the client via a player-scoped Realtime subscription after server authorization.
4. `components/stage25/EconomyMarketChart.jsx` polls `/api/economy/market` every 30 seconds and displays only returned data; endpoint still needs to be implemented and protected before the chart can show values.
5. Keep landscape/haptic behavior progressive-enhancement only: Screen Orientation and Vibration APIs are browser/device-dependent and must not block play.

## Literasi 5 — Mega AI and autonomous awareness (5 categories)
1. Toxicity/sentiment screening is an optional pre-send gate; false positives need a safe cancellation path and user-facing explanation.
2. GitHub commit summaries may be passed to an AI prompt only after payload length limits and secret redaction.
3. Heuristic rate limiting should be advisory first, bounded, observable, and never autonomously alter HP without a deterministic server policy.
4. Mega avatar hardware metrics must expose only safe aggregates (uptime/latency/energy status), not host secrets or raw process environment.
5. Logger theme adaptation must preserve owner preference and have hysteresis/restore logic so transient load spikes do not cause color flapping. Automatic AI-controlled theme switching remains a design contract, not enabled behavior.

## Tests and known limitations
- `npm run verify:stage25` runs Menfess session/quoted-ID isolation tests.
- `node --check src/services/menfessEngine.js` and plugin syntax check pass.
- Not yet production verified: central quote middleware wiring, GitHub issue creation/dispatch/webhook signature flow, Supabase Realtime event policies, market endpoint, AI toxicity provider, and actual mobile haptics/orientation behavior.
- Memory sessions reset on process restart and are single-process only. Use a durable store/Redis and atomic locks for multi-instance production.

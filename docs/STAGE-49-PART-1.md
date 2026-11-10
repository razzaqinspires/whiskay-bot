# Stage 49 — Part 1: Runtime & Group Cache Foundations

**Release:** Whiskay Bot v2.35.4  
**Status:** Implemented locally; deployment/live WhatsApp checks remain outstanding.

## 1. Scope

Part 1 is intentionally narrow. It prepares reliable runtime configuration and group metadata storage so later features do not need to perform repeated group queries. It includes TryCloudflare URL persistence, group lifecycle cache updates, `.joingc`, and cache-backed `.listgc`.

It does not implement automatic participant copying, bulk group invitations, stealth behavior, or any mechanism intended to evade WhatsApp's enforcement systems. These are not appropriate foundations for a reliable team bot. Later group workflows must be explicit, permission-aware, and consent-based.

## 2. TryCloudflare → `.env`

### World Boss webhook tunnel

When `cloudflared tunnel --url http://127.0.0.1:<port>` reports a Quick Tunnel URL, `worldBossTunnel.js` persists:

- `WHISKAY_BOT_WEBHOOK_PUBLIC_URL` — public base URL.
- `WHISKAY_BOT_WEBHOOK_URL` — public base URL plus `/webhooks/world-boss`.

The target is `ENV_FILE` when set; otherwise the project `.env` file. The terminal prints the detected URL, endpoint, and persistence result. If the file cannot be written, the tunnel remains reported as active with a persistence warning and a manual value is printed.

### Jadibot portal tunnel

The portal stores its latest temporary URL in `JADIBOT_LAST_TRYCLOUDFLARE_URL`. This is an informational record only. It is deliberately not read as `JADIBOT_PUBLIC_URL` or `JADIBOT_PORTAL_URL` on restart because Quick Tunnel addresses can change.

### Concurrent write safety

`src/lib/env-file.js` serializes writes per environment-file path and uses a unique temporary file plus atomic rename. Both tunnel workers use this shared writer, preventing one detected tunnel URL from overwriting the other's `.env` change. GitHub manifest synchronization now defaults to off; enable it explicitly only when needed.

## 3. Persistent group metadata

### Storage contract

- Service: `src/services/groupMetadataStore.js`.
- File: `data/group-metadata.json`.
- Schema: `{ version, snapshotComplete, updatedAt, groups }`.
- The store uses atomic snapshots and a short write debounce; a graceful bot stop flushes pending changes.

### Initial snapshot and delta events

If no completed initial snapshot exists, the bot performs one `groupFetchAllParticipating()` call after the WhatsApp connection opens, stores all participating groups, and marks the snapshot complete. A subsequent restart loads the local JSON rather than making that full request again.

After the initial snapshot, the store is updated from these socket events:

| Event | Cache action |
|---|---|
| `groups.upsert` | Insert or merge newly visible group metadata. |
| `groups.update` | Merge partial subject, description, settings, and other metadata without deleting cached participants. |
| `group-participants.update` | Apply add/remove/promote/demote/modify to only the affected participant records. |
| `chats.delete` | Remove locally deleted group chats. |

If the bot itself is removed from a group, its group record is removed. When `.leave confirm` succeeds, the cache entry is removed immediately. When `.joingc` succeeds, only that newly joined group's metadata is fetched once and stored.

### Baileys integration

The primary socket now supplies `cachedGroupMetadata`, and serializer/group guard/group tools prefer the durable cache. A metadata query is only used as a fallback when a group has no cached record. This follows Baileys' recommendation to supply cached group metadata and keep it warm from group lifecycle events:

- [Baileys README — Caching group metadata](https://github.com/WhiskeySockets/Baileys#caching-group-metadata)
- [Baileys official event documentation](https://github.com/WhiskeySockets/docs/blob/main/concepts/events.mdx)

The cache is a local replica, not a guarantee that WhatsApp will deliver every missed event while the bot is offline. If metadata becomes inconsistent, a future controlled owner refresh/reconciliation mechanism can be added as an explicit operation rather than making `.listgc` fetch on every invocation.

## 4. Owner commands

All commands below are owner-only through plugin metadata and an explicit `ctx.isOwner` check.

| Command | Behavior |
|---|---|
| `.joingc <url>` | Join by WhatsApp invite link; retains `.join` as an alias. Newly joined group metadata is fetched once. |
| `.listgc` | Interactive selectable list of cached group names, member counts, and IDs. |
| `.listgc detail <GROUP_ID>` | Detailed cached group summary, including an owner mention when available. |
| `.listgc members <GROUP_ID> [page]` | Paginated member list with role labels. |

`.groupbot list` now reads the same cache, and World Boss webhook targets are resolved from cached participating groups rather than fetching the full group list for every webhook event.

## 5. Files changed

- `src/lib/env-file.js`
- `src/services/worldBossTunnel.js`
- `src/services/jadibotPortal.js`
- `src/services/groupMetadataStore.js`
- `src/core/Bot.js`
- `src/core/serializer.js`
- `src/lib/group-guard.js`
- `src/plugins/general/group-tools.js`
- `src/plugins/owner/owner-parity.js`
- `src/plugins/owner/group-control.js`
- `src/index.js`
- `.env.example`, `src/config/settings.js`
- `package.json`, `package-lock.json`, `README.md`, `docs/README.md`

## 6. Tests and verification

Run:

```bash
npm run verify:stage49-part1
```

The 8 new tests cover:

1. Atomic group metadata snapshot and reload.
2. Partial group metadata updates retaining participant state.
3. Participant add, promote, demote, and remove delta updates.
4. Bot removal removing the group's cache record.
5. Owner-only `.joingc` registration and cache-only `.listgc` contract.
6. `cachedGroupMetadata` and required socket lifecycle event listeners.
7. Concurrent tunnel writers preserving both values in `.env`.
8. `ENV_FILE` persistence behavior and opt-in GitHub URL manifest sync.

JavaScript syntax checks are performed separately. No live WhatsApp or Cloudflare session is included in this source archive, so successful actual invite joins, group event delivery, and URL issuance must be checked after deployment.

## 7. Stage 49 parts

1. Part 1 — runtime foundations (this document).
2. Part 2 — explicit, consent-based group collaboration controls.
3. Part 3 — bounded WorkloadTracker queue and platform-compliant scheduling.
4. Part 4 — quality-aware XP and per-user energy/XP notification controls.
5. Part 5 — polling/serializer regression and documentation/release consolidation.

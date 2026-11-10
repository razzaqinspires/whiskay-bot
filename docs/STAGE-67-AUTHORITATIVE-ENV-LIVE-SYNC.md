# Stage 67 — Authoritative Environment Template & Live Runtime Sync

**Release:** v2.35.33 · **Part:** 10

## Objective
Make `.env.example` the authoritative inventory of configuration keys while keeping `.env` the private value store. New template keys are appended to `.env` automatically; existing private values are not overwritten. Runtime edits to `.env` and template edits are watched and applied without restarting the Node process where the consuming code supports dynamic reads.

## Implementation
- `src/config/EnvTemplateSynchronizer.js`: parses the template and private env file, adds missing declarations with template defaults, prunes only keys known to have been managed by an earlier template version, writes atomically, and stores a local plain-text key manifest.
- `src/core/EnvHotReloader.js`: watches both selected `.env` and `.env.example`, debounces editor/atomic-save events, synchronizes the template, refreshes runtime variables, and reports hot-reloadable vs restart-required keys.
- `src/config/index.js`: retains stable config object identity, updates `process.env`, deletes keys removed from the authoritative template, and emits `configEvents` `reload` events.
- `scripts/start.mjs`: loads existing `.env` settings, reconciles the template before importing modules that snapshot runtime settings, then loads newly appended keys.
- `scripts/sync-env-template.mjs`: manual synchronization command.
- `.gitignore`: ignores `.env.sync-state` and custom state manifests.
- `.env.example`: documents synchronization controls.

## Synchronization contract
1. `.env.example` is the key inventory and default-value template.
2. A key missing from `.env` is appended with the exact declaration/value from `.env.example`; e.g. `TEST_URL=` is appended empty.
3. Existing `.env` values win over template values. A template update does not overwrite owner credentials or local settings.
4. A key removed from `.env.example` is removed from `.env` only if it was recorded in the previous `.env.sync-state` manifest. The manifest is plain text, local-only, and contains key names only.
5. Unknown manually added `.env` keys are preserved.
6. Set `ENV_TEMPLATE_SYNC_PRUNE=false` to disable automatic removal. Set `ENV_TEMPLATE_SYNC_ENABLED=false` to disable synchronization. `ENV_TEMPLATE_FILE` and `ENV_TEMPLATE_SYNC_STATE_FILE` allow explicit paths.
7. Empty template values remain empty. This engine does not invent credentials or populate required secrets.

## Runtime behavior and limitations
`process.env` changes are visible to later reads in the main Node.js thread. The stable `config` object is mutated in place and `configEvents` emits `reload`. Existing local variables captured during module evaluation, constructor snapshots, open listeners/ports, Baileys socket state, worker-thread copies, and external child processes are not magically rebuilt. The reloader classifies known settings using `ENV_SETTING_MAP`; unknown keys and non-hot-reloadable settings are restart-required. A future service migration should subscribe to `configEvents` and implement explicit, reversible `applyConfig()` methods.

## Security
- No values or API keys are logged.
- Symlinked `.env`, `.env.example`, and sync-state files are rejected.
- Atomic temp-file + rename prevents partially written `.env` files from being read.
- Existing file modes are tightened to owner-only on writes (typically `0600`).
- The state manifest stores names only, never values.
- This does not replace secret-manager rotation or restart policies for credentials that are captured by SDK clients.

## Operations
- `npm run env:sync`: reconcile `.env` with `.env.example` manually.
- `npm run verify:stage67`: isolated tests for additions, preservation, deletions, multiline values, prune opt-out and plain-text state.
- `npm run verify:all`: includes Stage 67.

## Rollback
Stop the bot, restore the prior `.env` backup if necessary, revert `scripts/start.mjs`, `src/config/EnvTemplateSynchronizer.js`, `src/core/EnvHotReloader.js`, `src/config/index.js`, and remove the Stage 67 package scripts/test. The `.env.sync-state` file can be retained for audit or removed; it contains only managed key names. No database migration is required.

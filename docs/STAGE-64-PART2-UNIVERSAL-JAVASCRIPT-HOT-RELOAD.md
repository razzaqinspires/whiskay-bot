# Stage 64 Part 2 — Universal JavaScript Hot Reload Foundation

**Release:** v2.35.30  
**Baseline:** Part 7 v2.35.29  
**Scope:** JavaScript-only source detection across `src/**`, excluding `src/plugins/**`.

## Summary

This stage replaces the broad source watcher filter with an explicit `.js`-only watcher and introduces a conservative source-change planner. Plugin files remain owned by `PluginWatcher` and `PluginManager`. Runtime JavaScript changes are syntax-preflighted and use graceful process restart until a later module-lifecycle/dependency stage can safely replace live ESM references.

This is a universal JavaScript **watch/reload foundation**, not yet arbitrary in-process hot swapping. Node ESM keeps module instances and captured references in its module graph; importing one changed entry with a query string does not reliably replace all dependants. The design deliberately avoids claiming otherwise.

## Changed files

- `src/core/SourceWatcher.js`
  - Watches only `.js` files.
  - Excludes plugin tree, dependency/build/cache/session directories, and non-JavaScript assets.
  - Coalesces add/change/unlink events per file and reports structured `{ file, kind }` changes.
  - Tracks pending files and last batch time; stop clears pending work and closes watcher.
- `src/core/JavaScriptModulePolicy.js`
  - Normalizes source-relative paths and rejects traversal/non-JS paths.
  - Keeps plugin changes out of this watcher.
  - Classifies runtime changes conservatively and creates syntax-check/restart plans.
  - Deleted files are preserved in the change plan but excluded from syntax preflight.
- `src/core/Bot.js`
  - Routes structured source changes through the planner.
  - Restores `sourceReload` from RuntimeState on startup, falling back to `SOURCE_RELOAD`.
  - Logs strategy and changed paths for auditability.
- `src/core/RestartManager.js`
  - Syntax-checks only existing `.js` files; unlink events no longer fail because a removed file cannot be opened.
  - Persists changed-file metadata in restart history.
- `src/plugins/owner/sourcereload.js`
  - Updates owner-facing help/status to describe JavaScript-only scope and conservative restart behavior.
- `test/stage64-part2-universal-js-hot-reload.test.js`
  - Adds eight tests for path normalization, traversal rejection, plugin exclusion, runtime classification, unlink handling, and mixed batches.
- `package.json`, `package-lock.json`
  - Version bumped to `2.35.30`; adds `verify:stage64-part2` to `verify:all`.

## Operational behavior

- `.hotreload` continues to manage `src/plugins/**/*.js` through the plugin reload path.
- `.sourcereload on|off|status` manages JavaScript runtime-source watching.
- `SOURCE_RELOAD=true` enables the watcher by default unless a persisted RuntimeState value explicitly overrides it.
- Only `.js` source changes are watched. `.json`, `.md`, `.yaml`, `.mjs`, `.cjs`, assets, and runtime data do not trigger this watcher.
- Add/change events are syntax checked before restart. Unlink events trigger restart without syntax-checking a path that no longer exists.
- Arbitrary runtime ESM modules are **not** hot-swapped in-process in this stage. `core`, `services`, `jobs`, `handlers`, `middlewares`, `workers`, `cognitive`, `config`, and unknown roots use graceful restart. This is intentional until module lifecycle, dependency tracking, and managed service/job replacement are implemented.

## Configuration

Existing `SOURCE_DIR` continues to define the watched source root. Existing `SOURCE_RELOAD` controls the initial default. RuntimeState key `sourceReload` takes precedence after the owner changes the setting with `.sourcereload on/off`.

No new dependencies were added. Chokidar remains the watcher implementation.

## Validation

Run:

```bash
npm run verify:stage64-part2
node --check src/core/SourceWatcher.js
node --check src/core/JavaScriptModulePolicy.js
node --check src/core/RestartManager.js
node --check src/core/Bot.js
node --check src/plugins/owner/sourcereload.js
```

Then run `npm test` and `npm run verify:all` in a fully installed environment. A live WhatsApp session test is still required to verify restart behavior under the selected process supervisor.

## Migration and rollback

- No data migration is required.
- Existing `.sourcereload` command and `SOURCE_RELOAD` environment variable remain supported.
- If watcher behavior causes operational issues, run `.sourcereload off`; this persists the disabled state.
- For source rollback, restore the previous `SourceWatcher.js`, `Bot.js`, `RestartManager.js`, owner command, package metadata, and remove `JavaScriptModulePolicy.js` plus the Stage 64 Part 2 test. Keep the existing Stage 64 Part 1 files unchanged.

## Next stage boundary

The next engineering step should implement a managed module lifecycle and dependency graph, then support in-process replacement for explicitly registered modules. It should not attempt to live-replace arbitrary core/service imports until ownership of listeners, timers, jobs, connections, and captured references is explicit.

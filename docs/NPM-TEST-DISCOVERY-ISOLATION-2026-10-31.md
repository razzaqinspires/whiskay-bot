# npm test discovery isolation — 2026-10-31

## Goal

Prevent `npm test` from treating WhatsApp session files, installed dependencies, or runtime folders as test targets. Keep test writes away from the live session and application data directories.

## Changes

1. `package.json` routes `test` to `node scripts/run-tests.mjs`.
2. `scripts/run-tests.mjs` validates the project `test/` directory, recursively discovers only JavaScript test files inside it, skips symlinks, and invokes Node with an explicit file list.
3. `.testignore` is parsed by the discovery runner. It excludes `node_modules/`, `sessions/`, `.git/`, runtime/cache/build folders, and report output directories.
4. `SESSION_DIR`, `WHISKAY_DATA_DIR`, `JADIBOT_DATA_DIR`, `TMPDIR`, `TMP`, and `TEMP` point to a disposable OS temp directory. Cleanup occurs after process close or signal termination.
5. The wrapper allows only supported test-runner options (reporter, reporter destination, name/skip patterns, concurrency, timeout, and coverage). It rejects arbitrary paths and flags that could bypass the explicit discovery boundary.
6. `.gitignore` explicitly ignores nested `node_modules/`, nested `sessions/`, and `.test-runtime/`.
7. `.testcommands` help now explains the discovery boundary and filesystem isolation.
8. The status card body no longer repeats `📊 WHISKAY QA STATUS` or `Tidak ada proses QA yang sedang berjalan.` already represented by the title/subtitle.

## Important dependency note

Node still reads package files from the installed `node_modules/` when a test imports a dependency. This is normal module resolution and cannot be avoided for dependency-backed tests. The guarantee is that test discovery does not scan or execute files from `node_modules/`, and `npm test` does not install, remove, copy, clean, or modify that directory. The full owner QA pipeline runs `npm ci` in its own disposable sandbox, never in the live project.

## Commands

```bash
npm test
npm run verify:testcommand
npm run verify:all
```

For the owner control center:

```text
.testcommands run
.testcommands progress
.testcommands status
```

## Validation

- Test discovery fixture confirms that files under `sessions/`, `node_modules/`, and symlinked directories are not selected.
- Argument validation confirms that arbitrary filesystem paths cannot be appended to the Node test command.
- Focused testcommand/reporter/runner suite: 25/25 passed in the build environment.
- Full project `npm test` still requires the repository's complete dependencies and must be run on the target host before release sign-off.

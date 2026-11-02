# Stage 52 — Repository Structure Cleanup

**Release:** `2.35.15`  
**Date:** 2026-11-01  
**Scope:** Repository layout, operational entrypoints, documentation placement and obsolete-artifact cleanup.

## 1. Objective

Establish a predictable repository root and a clear separation between runtime source, operational scripts, configuration, documentation, test code, historical archives and mutable runtime data. This stage is a structural refactor; it does not intentionally change WhatsApp command behavior or the bot's business logic.

## 2. Root contract

The only regular files permitted directly in the repository root are:

- `package.json`
- `package-lock.json`
- `README.md`
- `LICENSE`

Required dotfiles and hidden directories remain at root, including `.env`, `.env.example`, `.gitignore`, `.testignore`, and `.github/`. Runtime/source directories such as `src/`, `scripts/`, `config/`, `data/`, `docs/`, `test/` and `vendor/` remain as directories.

## 3. Relocations

| Previous location | Canonical location | Reason |
|---|---|---|
| `CHANGELOG.md` | `docs/project/CHANGELOG.md` | Release history belongs with project documentation. |
| `MEMORY.md` | `docs/project/MEMORY.md` | Cross-stage working rules are project documentation. |
| `NOTICE-THIRD-PARTY.md` | `docs/legal/NOTICE-THIRD-PARTY.md` | Legal and attribution notices are grouped together. |
| `pair.js` | `scripts/pair.mjs` | Pairing setup is an operational script, not a root entrypoint. |
| `ecosystem.config.cjs` | `config/ecosystem.config.cjs` | PM2 process configuration belongs in `config/`. |
| `github/` | `docs/archive/legacy-github/github/` | Only `.github/` is automatically discovered by GitHub Actions. The old mirror is archived, not active. |
| `whiskay-local-fix-1.patch` | `docs/archive/patches/` | Historical patch is retained outside the active root. |
| `test/STAGE-49-PART-*-TEST-REPORT.md` | `docs/reports/stages/` | Reports are documentation, not executable test files. |

## 4. Obsolete artifacts removed

The following were removed after checking references and active configuration:

- Four unreferenced source snapshots: `src/core/Bot.js.pre-pairing`, `Bot.js.pre-src`, `Bot.js.pre-wire`, and `src/plugins/owner/hrlog.js.pre-v2`.
- `env.example`, an older duplicate of `.env.example` that lacked the maintained default prompt and current placeholder key.
- `gitignore`, an outdated duplicate of `.gitignore` with weaker runtime-data exclusions.
- Old generated local QA outputs from `data/test-reports/` (`LATEST.txt`, the dated npm CI/test ZIPs and the command-test JSON). The folder's operator guidance `README.txt` remains; future test runs continue to create new reports there.

The automated test source under `test/`, historical stage documents, `.github/` workflows and the canonical `.env.example` were retained. The distributable ZIP intentionally excludes the private `.env`, WhatsApp sessions, mutable `data/` databases, cached assets, saved images and generated reports; only the static `assets/dungeon/floors.json` seed is packaged.

## 5. Compatibility updates

- PM2 npm commands now point to `config/ecosystem.config.cjs`. The PM2 config resolves the project root and `scripts/start.mjs` from its own file location.
- Pairing helper is available as `npm run pair -- --help` or `node scripts/pair.mjs --help`. It resolves `.env` and relative session paths from the repository root even when invoked from another current directory.
- `scripts/auto-push.sh` includes `docs/project/CHANGELOG.md` in its metadata audit.
- README, documentation index, package metadata and lockfile were updated to version `2.35.15`.
- `npm run verify:stage52` checks root-file policy, document placement, script/config paths, active-vs-archived workflow layout, stale artifact removal and package/lockfile consistency. It is included in `npm run verify:all`.

## 6. Verification boundary

The Stage 52 test verifies filesystem structure and static configuration. It does not prove that a live WhatsApp session, PM2 installation, GitHub remote, external API or deployed tunnel is available. Those remain environment-specific checks.

## 7. Rollback

Restore the moved files to their former paths only together with the corresponding package scripts, README links, script references and workflow documentation. Do not restore the duplicate `gitignore` or old source snapshots into the active source tree. The legacy GitHub mirror and patch are available in `docs/archive/` for reference.

# Test Report — Stage 58 Part 1: Outbound Traffic Safety & Command Containment

- Release: `2.35.23`
- Stage: `58 / Part 1`
- Date: `2026-11-08`
- Scope: static source review, isolated unit/regression tests, syntax audit
- Live WhatsApp account, provider enforcement telemetry, and delivery tests: **not performed**

## Result summary

| Suite | Tests | Passed | Failed |
|---|---:|---:|---:|
| Stage 58 outbound safety | 12 | 12 | 0 |
| Stage 52 repository structure | 6 | 6 | 0 |
| Stage 53 Git upload/data exclusion | 6 | 6 | 0 |
| Stage 54 repository integrity | 3 | 3 | 0 |
| Stage 55 plugin command intelligence | 4 | 4 | 0 |
| Stage 56 Git move intelligence | 4 | 4 | 0 |
| Stage 57 Git recovery intelligence | 5 | 5 | 0 |
| Owner testcommands, runner and reporter | 26 | 26 | 0 |
| Git upload launcher checks | 5 | 5 | 0 |
| Stage 11 news/broadcast regression | 2 | 2 | 0 |
| **Total focused tests** | **73** | **73** | **0** |

A syntax audit ran `node --check` over **313 JavaScript/MJS/CJS files** under `src/`, `scripts/`, `test/`, `config/`, and `automation/`; all passed. `npm run audit:repository` also passed: 313 source files scanned, 410 relative imports checked, 0 missing imports, and package-lock consistency passed. The sanitized release ZIP was extracted into a clean directory and a 49-test smoke set passed 49/49; the archive retained mode `0755` on `scripts/git-upload.sh`.

## Full-suite limitation

A full `npm test` run discovered 99 test files and 431 subtests. It reported 401 passed, 30 failed, and 0 skipped. The failures were not established as code regressions: the package installation had timed out and left an incomplete `node_modules/` tree. Failure diagnostics explicitly included missing `dotenv/config` imports; several child-process tests reported only a generic subprocess failure, so those are not classified conclusively. The complete dependency install could not be completed in this environment.

`npm run verify:all` likewise cannot be certified green without a successful clean dependency installation. Do not treat the focused 73/73 result as a full-suite pass. Re-run on the deployment host after a successful `npm ci`:

```bash
npm ci
npm run verify:all
npm test
```

The failed full-suite diagnostic archive generated during this audit was stored locally at `data/test-reports/npm-test-20261108052553-1dcaba45-fail.zip` in the working copy. It is intentionally excluded from the release ZIP because `data/` is runtime/private data.

## Key regression coverage

- Baileys `sendMessage` and `relayMessage` interception and wrapper ordering for primary and Jadibot sockets.
- Outbound duplicate suppression, global/per-recipient rolling-window ceilings, persistent hash-only telemetry, and privacy checks (no raw JID or message body in tracker snapshots).
- `.bc` requires explicit target allowlists, preview token and owner confirmation; group membership and registered-user records do not imply consent. Broadcast remains disabled by default and uses a hard-capped target count and minimum delivery interval.
- `.testcommands run` stays silent from start through completion; duplicate runs are silent. Manual `.testcommands status` exposes active progress only. Older success reports and diagnostic ZIPs are hidden while a new run is active; report/download are blocked until completion.
- Self-authored/fromMe messages are dropped before feature events or command dispatch; direct natural-language egg-calculator invocation is removed.
- World Boss webhook fails closed without its explicit allowlist and opt-in switch.
- Stage 52 source snapshots are retained in `docs/archive/source-snapshots/`, outside `src/`; Stage 52 structural test passes.

## Incident assessment boundary

The original v2.35.22 source showed two high-risk outbound patterns: unrestricted `.bc` fan-out to all participating groups (and optionally registered users) with only a 900 ms delay, and automatic `.testcommands` progress messages emitted for every QA progress event. These are credible mechanisms for outbound bursts and are now removed or contained. They are **not proof** of the specific historical WhatsApp ban reason. The supplied source archive did not include an official enforcement notice, reason code, account-quality view, or timestamped provider-side delivery logs.

Other implicit/automated traffic paths identified and contained in this Part 1 include self-authored message re-dispatch, unprefixed egg-calculator intent dispatch, and Nexora private auto-reply enabled by the previous default configuration.

## Scope not yet shipped in Part 1

This stage adds deterministic local risk scoring, outbound telemetry, bounded queueing, and a two-worker outbound scheduler. It does **not** yet implement the planned AI-agent threat analyst or a distributed multi-process worker fabric. Those require a separate stage with explicit worker ownership, shared-state/locking semantics, model failure fallback, decision audit trails, and safe operator approval gates. No machine-learning or AI-based ban prediction is claimed here.

## Deployment notes

- Keep `WHISKAY_BROADCAST_ENABLED=false`, `WHISKAY_BOSS_WEBHOOK_ENABLED=false`, and `WHISKAY_AI_PRIVATE_AUTO_ENABLED=false` unless an explicit, consent-based use case is verified.
- Keep recipient allowlists empty until recipients have consented and JIDs have been confirmed.
- Preserve the current `.env` locally; do not replace it with the sanitized release archive. Merge only the required new keys from `.env.example`.
- Back up the local runtime data and Baileys session before applying source updates.
- Test first with a separate WhatsApp test account and test groups. This change cannot guarantee an account will never be restricted; it reduces accidental, duplicate, high-volume, and unrequested traffic.

## Rollback

Disable the three opt-in features above before rollback. If reverting Stage 58 source, do not restore the old unrestricted `.bc`, chatty `.testcommands`, self-message dispatch, or Nexora auto-private defaults. Keep a copy of this report and the Stage 58 source documentation with the release.

# Test Report — Testcommand Diagnostic Delivery & Regression Repair

Date: 2026-10-31  
Base: Whiskay Bot v2.35.4  
Scope: QA report supplied by owner, Testcommand UX, Baileys document delivery, and 15 regression failures.

## Original failure inventory and disposition

| Area | Root cause | Disposition |
|---|---|---|
| Stage 31 economy | Test changed `process.cwd()` but inherited the runner's `WHISKAY_DATA_DIR`, so it inspected the wrong ledger location. | Test fixture now sets/restores an isolated `WHISKAY_DATA_DIR`. |
| Automation guardrails | Legacy metrics/history workflows retained write permissions and automatic triggers/commit behavior. | Workflows are `workflow_dispatch` only, `contents: read`, and no commit/push step. |
| Chess rules | Regression test asserted removed pseudo-legal helper and warning-count implementation. | Assertions now check chess.js legal move validation and player allowlist. |
| Group safety | `.grouphelp` appeared in help text but was absent from the plugin command registry/handler. | Registered and implemented `.grouphelp`. |
| Group feature guard | A cache miss (`null`) was treated like an explicit no-metadata sentinel, so Baileys metadata refresh was skipped. | Explicit `ctx.groupMetadata: null` remains a sentinel; absent context + cache miss now attempts one `sock.groupMetadata(chat)` fetch. |
| Premium gate | Test expected an obsolete source expression and missed the current owner bypass. | Assertion updated to the actual owner-aware premium gate. |
| Charging warning | Test searched for the warning in generic middleware; the warning belongs to the Raid Boss command. | Test now checks the correct command implementation. |
| Serializer import | Test expected a single imported symbol; `Bot.js` imports the serializer runtime and poll helpers together. | Assertion accepts the actual grouped named import. |
| Nexora environment | `.env.example` contained an empty `AI_SYSTEM_PROMPT`, contrary to the documented prefilled prompt contract. | Added a concise safe default prompt. |
| Stage 37 docs | Root README/docs index omitted the parity manifest references. | Added Stage 37 links and explicit incomplete-parity note. |
| Stage 38 listgc | Test expected live group discovery while the implementation deliberately reads the event-fed local metadata cache. | Test seeds an isolated cache and checks list-select rows; no participant details are exposed. |
| Stage 40 docs | README/docs index omitted the source-parity audit JSON link. | Added Stage 40 audit references and limitation note. |
| Stage 46 env schema | `.env.example` omitted `JADIBOT_LAST_TRYCLOUDFLARE_URL` from the settings map. | Added the empty, non-secret setting key. |

The 15 original failing assertions/locations reduce to the root causes above; multiple group-feature locations shared one cache-miss defect.

## Test results

| Verification | Result |
|---|---:|
| Targeted regression and Testcommand suite | 78/78 passed |
| Full test discovery excluding two Baileys-dependent test files unavailable in this build environment | 339/339 passed |
| `verify:stage31` | 3/3 passed |
| `verify:stage32` | 5/5 passed |
| `verify:stage34` | 15/15 passed |
| `verify:stage45` | 10/10 passed |
| `verify:ops` | 7/7 checks passed |
| JavaScript syntax audit | 277/277 passed |

## Environment limitation

A complete `npm ci` could not finish in this build environment: npm registry requests repeatedly returned `EAI_AGAIN` and the install process timed out. The partial `node_modules` tree was not packaged. Consequently, the two test files that import `@whiskeysockets/baileys` directly (`stage41-game-transplant.test.js` and `stage44-quiz-isolation-poll-serializer.test.js`) could not load in this environment. The other 339 discovered tests passed. Run `npm ci && npm test && npm run verify:all` on the owner's host to obtain the final full release gate with the complete lockfile dependency set.

## Diagnostic ZIP delivery

- `.testcommands status` includes a `📦 Kirim ZIP Diagnostik` native-flow quick-reply action.
- `.testcommands download` sends the newest matching archive from `test/reports/diagnostics/` as a WhatsApp document using `sock.sendMessage(chat, { document: Buffer, mimetype: 'application/zip', fileName, caption }, { quoted })`.
- Archive selection is restricted to the diagnostic directory and the expected filename pattern. Symlinks are rejected; empty or files larger than 25 MiB are not sent.
- A failed Baileys send returns an interactive retry action. Successful sends return an interactive confirmation.
- Progress cards, failure cards, status, report, and help have actionable native-flow buttons, with the serializer's text fallback retained.

## WhatsApp/Baileys verification boundary

Baileys documents `sock.sendMessage(jid, content, options?)` as the standard send entry point and supports media buffers in message content. This implementation uses the document content form with `mimetype`, `fileName`, and optional quoted WAMessage. Native-flow buttons remain handled by the project's serializer compatibility adapter and the incoming `selectedButtonId` is routed through the normal command parser. A live message send was not performed from this build environment; verify the button and ZIP delivery on the owner's connected WhatsApp session.

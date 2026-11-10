# Owner Testcommand — Delivery and Command Routing Fix (2026-10-31)

## Observed behavior

The chat transcript showed attempts using `.testcommand`, `.testcmd`, and `.testcommands`. The prior plugin registered only `testcommands` and `testcmds`, so the singular forms were unresolved. In addition, a bare `.testcommands` defaulted to `run`, which could launch `npm ci` and a full verification sequence when the user only intended to inspect the command.

## Changes

- Registered `.testcommands`, `.testcommand`, `.testcmd`, and `.testcmds` as aliases in the plugin's `command` list.
- Changed the default action to `help`; long-running verification is only launched by `.testcommands run` or `.testcommands start`.
- Reduced the shared plugin cooldown from 60 seconds to 2.5 seconds. The runner's process lock plus plugin active-run state prevent duplicate QA sessions.
- Send the acknowledgement before launching the test runner, then continue the runner asynchronously in the background.
- Send progress notices for dependency installation, the configured full verification gate, and `npm test`.
- Keep `.testcommands status` and `.testcommands report` available while the run is active.
- Use WhatsApp native-flow buttons on help, start acknowledgement, active-run duplicate notice, status, report, and final result; retain a plain-text fallback when interactive delivery is unavailable.
- Help is a complete control-center panel: purpose, all pipeline phases, output paths, diagnostic contents, isolation guarantees, timeout/network caveats, and owner-only policy.
- Add three-button navigation: Start Full QA, Status QA, and Success Report. Status/report views provide contextual buttons to refresh, start, or return to help.
- Preserve owner-only access and energy exemption. The QA runner still uses its isolated sandbox and does not execute business commands individually.

## Command examples

```text
.testcommands                 # help only
.testcommand                  # help alias
.testcmd                      # help alias
.testcmds                     # help alias
.testcommands run             # start full QA in background
.testcommands status          # active run + latest artifacts
.testcommands report          # last complete success report
.testcommands help
```

## Verification

`npm run verify:testcommand` runs the runner regression tests and plugin behavior tests. The new plugin tests verify alias registration, help-only default behavior, owner gating, immediate acknowledgement, background execution, duplicate-run prevention, live status access, and final result delivery.

Live WhatsApp message delivery still requires a real connected Baileys session and should be checked after deploying the updated plugin. A local plugin test cannot prove delivery through the user's production session.

## Interactive UX revision

Bare `.testcmd` and every alias now open a native-flow control-center card rather than a text-only help message. The card contains the complete QA lifecycle and three actions: **Mulai Full QA**, **Status QA**, and **Laporan Sukses**. Status, report, unknown-action, duplicate-run, start acknowledgement, and final-result screens also expose relevant quick-reply actions. Buttons are built with the existing `ctx.sendInteractive`/Baileys native-flow transport; if that transport rejects a message, the same content is delivered as plain text.

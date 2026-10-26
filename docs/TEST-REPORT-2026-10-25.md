# Test and verification report — 2026-10-25

## Scope

This report covers local static checks and deterministic tests for the mini-web pairing portal, GitHub command, and source/configuration updates packaged on 25 October 2026. It is not a claim of a successful live WhatsApp pairing or production deployment.

## Automated tests run locally

| Check | Result | Notes |
|---|---|---|
| `node --check src/services/jadibotPortal.js` | PASS | Module syntax parses under the current Node runtime. |
| `node --check src/plugins/general/jadibot.js` | PASS | Jadibot plugin syntax parses. |
| `node --check src/plugins/tools/github.js` | PASS | GitHub plugin syntax parses. |
| `node --check src/index.js` | PASS | Portal lifecycle import and shutdown syntax parse. |
| `node --check test/jadibot-portal.test.js` | PASS | Test module syntax parses. |
| `node --test test/jadibot-portal.test.js test/github-tools.test.js` | PASS — 5 tests | Phone validation, host-mode selection, local HTTP portal form, WhatsApp deep-link generation, ticket ownership/single-use confirmation, GitHub stats without fabricated traffic and latest commits. |
| `python3 -m py_compile .github/scripts/update_github_metrics.py` | PASS | GitHub metrics automation script compiles. |
| Metrics generator smoke test | PASS | Generated sample Markdown and Mermaid chart section using a local fixture; no live metrics were invented. |
| `npm ci --ignore-scripts --no-audit --no-fund` | TIMED OUT | The package install did not complete in the available execution window; the partial `node_modules` directory was removed from the release archive. |
| Full pre-existing `npm test` suite | NOT RUN | It depends on the incomplete package install. Run `npm ci && npm test` from the project directory once network/package installation succeeds. |
| Cloudflare quick-tunnel download and public reachability | NOT RUN | Requires external network, a successful `cloudflared` download/handshake and live public URL. |
| QR login / actual pairing code / WhatsApp linked-device login | NOT RUN | Requires a real WhatsApp account, QR/pairing interaction and connected main bot. |
| Owner/premium access and expiry in running bot | Source-reviewed only | Needs runtime test with one owner account, active Premium account, non-premium account, and a short expiry in an isolated test environment. |
| GitHub Actions execution and traffic API | NOT RUN in this local archive | Workflow runs only in the real GitHub repository. Visitor metrics need the configured secret and sufficient permission. |

## Deterministic portal test coverage

1. Accepts an international-format phone number and rejects a leading-zero local number, alphabetic input, and oversized input.
2. Host selection returns TryCloudflare in default local-auto mode, honors explicit on/off, uses public URL mode when configured, and disables tunnel on a known deployment marker.
3. Starts the local HTTP portal with a test-only URL, loads `/pair/{ticket}`, submits a phone number, verifies it returns a `wa.me` URL with a `.jadibotconfirm` token, consumes the ticket only for the owner, and rejects a second use.
4. Test server and temporary ticket data are cleaned up after test completion.
5. GitHub command tests mock public REST responses and confirm traffic is explicitly unavailable when no traffic token is configured; recent commit output is formatted correctly.
6. Portal starts an independent periodic cleanup timer for expired/used ticket records; the timer is `unref()`ed and cleared on shutdown.

## Manual acceptance checklist before production

- [ ] Verify `.jadibot` is denied for non-Premium, non-owner user.
- [ ] Verify `.jadibot pairing` from private chat emits a real CTA URL reachable over HTTPS.
- [ ] Open form on Android, input a second WhatsApp account's number, submit, return to the bot chat and press Send on `.jadibotconfirm <token>`.
- [ ] Confirm pairing code is delivered only in the chat and works inside WhatsApp → Perangkat tertaut → Tautkan perangkat → Tautkan dengan nomor telepon.
- [ ] Confirm credentials are stored under `data/jadibot/sessions/<user-key>` and persist after a process restart.
- [ ] Confirm `.jadibotlogin` reconnects the persisted session and `.jadibotlogout` removes its auth files.
- [ ] In isolated data, set a one-minute expiry and confirm the periodic worker stops the sub-bot after expiry and sends a best-effort notice.
- [ ] Confirm `.perpanjang` creates a reference, the owner checks the actual incoming payment, and only `.jadibotapprove` extends the expiry.
- [ ] On a local environment without public URL, confirm TryCloudflare logs the generated URL. On the real hosting provider/VPS, configure `JADIBOT_TUNNEL=off` and `JADIBOT_PUBLIC_URL` and confirm no quick tunnel process appears.
- [ ] Add `WHISKAY_GITHUB_TRAFFIC_TOKEN` only to GitHub Actions secret storage, run workflow manually, and inspect the updated README metric block and chart.

## Known limitations and risk notes

- Host detection is heuristic. Explicitly configure `JADIBOT_TUNNEL` and `JADIBOT_PUBLIC_URL` on unusual VPS/container hosts.
- `wa.me` opens a prefilled message but cannot auto-send it.
- TryCloudflare is ephemeral and intended for testing/development, not production; use a persistent HTTPS host for customer-facing use.
- Manual payment approval does not integrate with a bank/payment-provider webhook.
- Bot state/session JSON is single-process local persistence, not distributed storage. Do not run multiple uncoordinated replicas over the same auth state.
- GitHub repo traffic is rolling 14-day data only, not lifetime visits. Missing permissions display as unavailable rather than an invented zero.

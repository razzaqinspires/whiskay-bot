# Test Report — 2026-10-26

## Local test run

Command: `npm test`  
Runtime: Node.js 20+  
Result: **48 passed, 0 failed, 0 skipped**.

Coverage includes:

- Pairing phone normalization and international-format validation.
- Host-mode detection for local tunnel, configured public URL, and deployment environments.
- Pairing portal form, WhatsApp confirmation deep link, one-time ticket consumption, and the rate-limit threshold/expiry behavior.
- Existing RPG transactions, sync, economy, gacha, downloader, energy, guild-memory, moderation, and menu regressions.
- GitHub stats/commits behavior without fabricating traffic values.

Additional checks:

- `node --check src/services/jadibotPortal.js`: passed.
- `node --check test/jadibot-portal.test.js`: passed.
- Full-source syntax check is defined in `.github/workflows/ci.yml`.
- ZIP integrity and secret-file exclusion are checked during packaging.

## Not tested in this environment

- Live Baileys pairing with a real second WhatsApp account.
- Reachability through a real TryCloudflare tunnel or a deployed reverse proxy.
- Remote GitHub Actions execution after pushing this archive.
- Production load testing or multi-process rate limiting.

A local green test suite does not guarantee production readiness; verify the deployment URL and test with a secondary WhatsApp account before enabling the feature for customers.

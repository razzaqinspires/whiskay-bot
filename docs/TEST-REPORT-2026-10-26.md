# Test report — 2026-10-26 (v2.5.2)

## Result

- Full local test suite: **58 passed, 0 failed, 0 skipped**.
- Targeted egg calculator + group feature tests: **10 passed, 0 failed**.
- The first group-feature test run exposed two issues (stale metadata cache across test sockets and welcome event metadata reuse); both were fixed before the full passing run.
- The existing Stage 17 assertion was updated to reflect the safer metadata-based permission check rather than the old `ctx.isAdmin` flag.

## Coverage added

1. Egg calculator CTA contract, HTTPS validation, and whole-egg help content.
2. Per-group settings defaults, persistence, invalid group IDs, and allowlisted setting keys.
3. Anti-link deletion for a non-admin when the bot is admin.
4. Admin exemption from anti-link.
5. Welcome template placeholder replacement and mention list.
6. Registration of all documented group tools.

## Other verification

- `node --test` — passed 57/57.
- JavaScript syntax checks — performed after changes (see release packaging command).
- ZIP integrity check and secret-file exclusion — performed before release.

## Not verified in this environment

- Live pairing against a real WhatsApp account.
- Live group moderation against a real WhatsApp group.
- Whether the external calculator URL is currently deployed and reachable from WhatsApp WebView.
- GitHub Actions execution on the remote repository.
- A clean `npm ci` from a fresh network fetch; the install attempt timed out, although the available local dependency tree supported the full passing test run.

## Operational caveats

- Anti-spam counters are in-memory and reset on restart.
- Group settings persist in `data/group-settings.json`; keep that file backed up if settings matter.
- Anti-link/anti-spam deletion requires bot-admin privileges. If the bot is not admin, it warns but cannot delete.
- `EGG_CALCULATOR_URL` points to a separately hosted website; the website source is not part of this bot archive.

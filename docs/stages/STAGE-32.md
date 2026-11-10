# Stage 32 — Menu, Energy, Profile, Leveling

## Audit findings
- The source has `src/core/serializer.js` and `src/core/serializer-compat.cjs`; no `serializer-compact.cjs` exists in the supplied Stage 31 archive.
- `energyWorker` previously consumed only `min(balance,cost)` but did not prevent the plugin from executing when balance was already zero.
- Menu widget rendering had one global symbol wrapper and hard-coded 100-command pagination; battery banner bypassed the widget formatter.
- Several `.setmenu` branches returned plain text after list selections, severing the navigation path.
- `leveling.js` read-modify-write calls could race on concurrent messages because writes were not serialized.

## Implemented
- `widgetDesign` presets are independent from full-menu template and symbol prefix/suffix.
- Energy banner can be hidden; its style goes through widget formatter when shown.
- Pagination supports 100–500 items or unlimited mode (unlimited mode disables page navigation).
- Owner can apply a global baseline; per-user overrides are preserved. Reset menu/status/profile/all is exposed through a list.
- Forwarded-label, battery-font, and energy-notification choices now return interactive confirmations with navigation.
- Fake Contact and Fake Product selections open configuration flows. Product image URL accepts HTTPS and is stored per user; rendering of that image remains dependent on the Baileys quote implementation.
- Profile card includes widget settings and user-specific canvas controls.
- `.modcoin` with no argument now opens an interactive balance/action menu. Status uses two quick replies plus a single-select list for Coin Mod, anti-spam, cooldown, and canvas.
- Energy middleware rejects a paid command before plugin execution when the adjusted cost exceeds the available balance. The affordability decision uses the shared `canExecuteWithEnergy()` policy and fails closed; recovery/control allowlist commands and explicit free/zero-cost plugins remain exempt. Ledger read/write errors also stop paid command execution.
- Leveling writes are serialized in-process; test-only `WHISKAY_DATA_DIR` support isolates tests.

## Not claimed complete
- The JSON ledger is still single-process local storage; no DB transaction or multi-replica lock exists.
- WhatsApp client behavior for forwarded metadata and synthetic quote previews requires a live-device test.
- The image URL for Fake Product is stored and passed through the UI options, but the actual card image rendering must be verified against the installed Baileys version.
- The global baseline applies to menu settings and status/profile canvas defaults stored in the settings object. It does not replace existing per-user overrides.

## Tests
- `npm run verify:stage32`: 5/5 passed after replacing the formatting-sensitive source regex with behavior checks for free mode, explicit zero cost, static paid cost, zero/insufficient balance, exact-balance allowance, and invalid-ledger fail-closed behavior.
- The full `npm run verify:all` chain was not rerun for this maintenance patch.
- No live WhatsApp session or production payment gateway was exercised.

## Rollback
Restore Stage 31 source. Preserve `data/leveling.json`, `data/menu-settings.json`, `data/menu-global-defaults.json`, and `data/energy-ledger.json`; back up before replacing code. The new fields are additive JSON keys.

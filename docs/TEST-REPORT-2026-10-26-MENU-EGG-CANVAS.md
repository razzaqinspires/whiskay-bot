# Test Report — v2.5.5 Menu / Egg Canvas / Serializer

Date: 2026-10-26 (Asia/Jakarta)

## Results performed in the build container

- `node --check` across every `.js` and `.cjs` file under `src/` and `test/`: PASS.
- Targeted Node test suite: 9 passed, 0 failed.
  - Egg calculation positive integer validation.
  - Whole-egg floor rounding, totals and change.
  - Insufficient-cash shortfall.
  - Upper-bound validation.
  - Calculator list/manual/website CTA payload.
  - HTTPS URL rejection.
  - Help content regression.
  - Six theme names and explicit confirmation route.
  - Symbol/quote mode configuration and category grouping.
- Canvas smoke test: PASS. `renderEggResultCardV2()` and `renderMenuCardV2()` both returned PNG buffers using the available renderer fallback.
- ZIP integrity: verified separately after packaging.
- `npm ci --ignore-scripts --no-audit --no-fund`: TIMEOUT in the environment; dependencies were not fully installed.
- Full `npm test`: NOT RUN because dependency installation timed out.
- Live WhatsApp Android/iOS/Web delivery and real website reachability: NOT TESTED.

## Known boundaries

Baileys issue #2465 reports inconsistent delivery/rendering of list messages on some recent versions. The feature retains a direct text command and normal text fallback; interactive lists should be verified with a test account on the target WhatsApp client.

The report distinguishes checks actually performed from checks that require a connected WhatsApp account or a completed dependency install.

---

## Documentation continuity note (2026-10-29)

This file is retained as part of the historical implementation record. For the current cross-stage status, recent fixes, test commands and known limitations, see [Master Stage Archive](STAGE-1-22-MASTER-ARCHIVE.md) and the [documentation index](README.md). Newer behavior supersedes earlier implementation details only where the dated update explicitly says so; previous decisions and history are not deleted.

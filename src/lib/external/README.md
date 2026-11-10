# Protected third-party libraries

`src/lib/external/` is a source-preservation zone for code supplied by third parties.

Rules:
- Never reformat, rename symbols, translate comments, refactor, patch, or otherwise edit a supplied source file in this directory.
- Preserve its original module format and attribution. Use `.cjs` for CommonJS and `.mjs` for ESM where needed.
- All configuration, response formatting, provider selection, fallback, validation, and command integration must live in adapters/controllers outside this directory.
- Universal source hot reload and deterministic/NEXORA git repair must ignore this zone.
- Before and after integration, record and verify the source SHA-256. Any upstream update must be added as a new reviewed version, not silently overwrite the existing source.
- Do not claim fallback is available until a second independently implemented provider is registered and tested.

The Westmanga source was supplied by the user and is preserved as `westmanga/westmanga-scraper.cjs`.

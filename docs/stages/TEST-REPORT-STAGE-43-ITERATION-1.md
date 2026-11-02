# Stage 43 Iteration 1 — Test Report

| Check | Result |
|---|---:|
| Leveling data survives a separate Node process restart | PASS |
| Corrupt primary recovers prior valid backup | PASS |
| Archive snapshot is created at configured threshold | PASS |
| Corrupt primary and backup recover from checksum-verified archive | PASS |
| Reply-only image upload stores avatar and clears one-time pending token | PASS |
| Canvas V1/V2 render distinct landscape PNG files | PASS |
| `node --check` across `src/`, `test/`, and `scripts/` (242 files) | PASS |
| Live WhatsApp reply-to-upload interaction | NOT RUN (requires linked WhatsApp session) |
| Production filesystem crash/power-loss test | NOT RUN |

Archive verification checks the SHA-256 sidecar before decompression and then validates the JSON schema. The full repository test suite was not run because this workspace has no installed `node_modules/dotenv`; install dependencies and run `npm run verify:all` before production release.

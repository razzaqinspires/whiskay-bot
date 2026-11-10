# Test report — Stage 42 Iteration 1

| Check | Result |
|---|---|
| Cloudflared fallback resolver | PASS |
| Missing binary actionable error | PASS |
| `node --check` changed module | PASS |
| JS/MJS/CJS syntax sweep | PASS |
| `npm run verify:all` | BLOCKED/FAIL in environment: 6 subprocess tests cannot import `dotenv` because dependencies are not installed |
| Real Cloudflare tunnel | NOT RUN (deployment environment required) |
| WhatsApp LID/Signal resync and group decrypt | NOT RUN (live linked session required) |

The Stage 42 targeted test suite passed 2/2. Do not interpret the full-suite failure as a passing result.

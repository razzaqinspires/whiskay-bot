# Stage 32 QA Report — refreshed for v2.35.4

- Syntax checks: `src/core/WorkloadCortex.js`, `src/middlewares/energy-worker.js`, and `test/stage32-regression.test.js` passed `node --check`.
- `npm run verify:stage32`: **5 tests passed, 0 failed**.
- Energy-policy regression coverage now checks runtime return values and affordability decisions rather than relying on a whitespace-sensitive source-code regex.
- Covered: concurrent XP write preservation; independent menu settings; explicit free and zero-cost exemption; paid static workload; rejection at zero/insufficient energy; exact-balance allowance; invalid-balance fail-closed behavior; middleware wiring; serializer compatibility path; owner global defaults preserving user overrides.
- Adjacent regression checks: Stage 34 core **15/15 passed** after updating two stale expectations to the later adaptive Stage 45 policy; Stage 45 energy tests **10/10 passed**.
- Not covered: full `npm run verify:all`, live WhatsApp middleware execution/socket delivery, live interactive rendering, fake product thumbnail rendering, payment processing, cross-process ledger transactions, or production deployment.

The original failure was caused by a test expecting the literal text `energyMode === 'free'`, while the valid implementation was written as `plugin.energyMode==='free'`. The test was changed to assert policy behavior. The shared `canExecuteWithEnergy()` policy is now used by the middleware itself: zero-cost workloads bypass the ledger, while paid or invalid workloads require a valid covered balance and fail closed otherwise.

# Stage 51 — Adzan Profiles Test Report

## Focused tests

Command:

```bash
node --test test/adzan-profile-store.test.js
```

Result: **8 tests passed, 0 failed**.

Coverage:

1. Owner default and per-user location are isolated; personal location takes precedence.
2. A location cannot be stored without an explicit pending request.
3. A non-owner cannot save into the owner-default slot.
4. IANA timezone validation and per-user timezone persistence.
5. Backup generation and recovery from a corrupt primary using a valid backup.
6. Backup-write failure aborts the mutation and preserves the primary file byte-for-byte.
7. Legacy group settings migrate into the protected shared JSON store.
8. Legacy group reminder read/write/delivery-state APIs remain compatible.

## Additional checks

- `node --check` passed for `AdzanProfileStore.js`, `AdzanManager.js`, `adzan.js`, and `handlers/message.js`.
- The tests use an OS temporary directory through `WHISKAY_DATA_DIR`; they do not write to production `data/`.

## Not tested in this environment

- Live WhatsApp Current Location receipt from Android/iOS clients.
- Production filesystem crash/power-loss behavior.
- Prayer schedule correctness and audio delivery; these belong to the next staged part.

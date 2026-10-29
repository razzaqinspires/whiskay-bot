# Stage 39 — Group Administration Parity

## Iteration 1
- Per-group `.bancmd` / `.unbancmd` and `.ephemeral` controls. See [`STAGE-39-GROUP-ADMIN-ITERATION-1.md`](STAGE-39-GROUP-ADMIN-ITERATION-1.md).

## Iteration 2
- Persisted group schedule for open/close in WIB and customizable leave message template. See [`STAGE-39-GROUP-ADMIN-ITERATION-2.md`](STAGE-39-GROUP-ADMIN-ITERATION-2.md).

## Iteration 3 — forwarding and invite/profile utilities
- `.totag`, `.tohidetag`, `.inviteinfo <link>`, and `.setppgc` added with URL validation, media limits, permission checks, and capability guards.

## Iteration 4 — attendance and pin controls
- Added persistent `.absen` lifecycle (`buka`, register, `list`, `tutup`, `reset`) with duplicate prevention and admin-only lifecycle changes.
- Added `.pinchat` / `.pinpesan` with an explicit 24h/7d/30d duration allowlist and socket error handling. Confirm live API compatibility before production reliance.

## Remaining audit queue
- Audit remaining settings aliases, media-based welcome/leave parity, and any other source commands not yet mapped.
- Live WhatsApp tests and broader feature parity review.

Stage 39 is in progress; the complete Experimental-Bell group feature set has not yet been transplanted.


## Iteration 3 — forwarding and invite/profile utilities

Added `.totag`, `.tohidetag`, `.inviteinfo <link>`, and `.setppgc` with URL validation, media limits, permission checks, and socket capability guards. See [`STAGE-39-GROUP-ADMIN-ITERATION-3.md`](STAGE-39-GROUP-ADMIN-ITERATION-3.md).


## Iteration 5 — Group settings alias parity

See [Iteration 5](STAGE-39-GROUP-ADMIN-ITERATION-5.md) and [test report](TEST-REPORT-STAGE-39-ITERATION-5.md). Added settings aliases and `.group` umbrella; live WhatsApp validation remains required.

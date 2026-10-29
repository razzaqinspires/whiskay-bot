# Stage 39 — Iteration 4: Attendance and Pin Controls

Version: 2.25.3  
Date: 2026-10-29

## Added

- `.absen buka [judul]`: admin/owner opens a new attendance session and clears entries for the new session.
- `.absen`: a member records their own attendance once while the session is open.
- `.absen list`: lists attendance names and timestamps.
- `.absen tutup`: admin/owner closes the active session.
- `.absen reset`: admin/owner clears the session and its records.
- `.pinchat 24h|7d|30d` and alias `.pinpesan`: request pinning of the replied-to message, guarded by group admin and bot admin checks.

Attendance is stored per group in `data/group-settings.json`, uses a maximum of 1,000 entries, and deduplicates by sender JID. Settings persistence uses the existing atomic temp-file rename path. Do not treat attendance records as a cryptographic audit trail.

## Validation

`npm run verify:stage39` covers attendance persistence, duplicate prevention, admin-only lifecycle actions, closed-session behavior, pin duration validation, and the constructed socket payload.

Pin payload compatibility is version-dependent. Mock tests do not prove the pin API is supported by the installed Baileys release or accepted by WhatsApp. Test in a controlled group before production use.

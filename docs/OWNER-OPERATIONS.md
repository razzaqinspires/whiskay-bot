# Owner Operations

This document summarizes owner-facing controls implemented in Whiskay's current plugin architecture.

- Owner-only group and user listings use bounded pagination and permission checks.
- User bans support timed/permanent policies with protected owner identities and safe target validation.
- Energy administration records bounded audit metadata and never returns secret credentials.
- Owner grants are persisted and only the primary configured owner can modify them.
- Native blocklist changes require explicit confirmation and reject self/owner targets.
- Maintenance mode supports `.offline`, `.online`, and `.offlinestatus`; normal user commands are gated while essential help/status and owner controls remain available.
- Session diagnostics expose metadata only; session secrets are never displayed or deleted by these commands.

# Stage 55 — Plugin & Command Intelligence

**Release:** Whiskay Bot v2.35.18  
**Date:** 2 November 2026

## Goals
- Detect candidate duplicate command and alias declarations across `src/plugins/`.
- Flag plugin metadata that cannot be statically parsed and handlers not found by conservative patterns.
- Keep findings advisory: no plugin is removed, disabled, or rewritten automatically.
- Make upload stop on an unresolved `origin/main` merge conflict, preserve local changes, and create local diagnostics.
- Limit whitespace checks to changed executable/configuration files; historical documentation/vendor whitespace must not block an unrelated upload.

## Commands
```bash
npm run audit:plugins
npm run verify:stage55
```

## Upload behavior
The launcher first creates a security-checked timestamped snapshot commit on `upload/*`, so a dirty working tree cannot prevent Git from attempting the base sync. If merging `origin/main` still conflicts, the launcher aborts the merge, writes a local-only report, returns to the source branch, preserves the upload branch/commit for manual resolution, and exits with status 9. Resolve the conflict and rerun the upload flow; it must not continue QA or publish a branch that failed synchronization.

## Limitations
Static command parsing is heuristic. Dynamic command arrays, factory-generated plugins, and conditional registrations may not be fully understood. Duplicate candidates require manual review because intentional aliases and plugin precedence may be valid.

# Stage 40 — Iteration 8 (v2.26.7)

## Scope

- Continue the downloader parity audit with regression coverage around the existing adapters and YouTube command family.
- Add an owner-only command for saving an image message to a stable local path, useful for referencing an image asset from configuration or source code.

## Owner image-save commands

- `.saveimg [nama-file]`
- `.saveimage [nama-file]`
- `.saveimagepath [nama-file]`
- `.imgsave [nama-file]`

Use by replying to an image with the command, or put the command in the caption of the image itself. The image is saved into `data/saved-images/`; the bot replies with relative and absolute paths. Supported MIME types: JPEG, PNG, WebP, GIF. Maximum size is 15 MiB. Filenames are sanitized and existing files are not overwritten. Paths are deliberately constrained to the dedicated directory to prevent arbitrary file writes.

## Verification

- Unit tests cover owner-only registration, ephemeral/view-once message unwrapping, supported MIME mappings, and filename traversal sanitization.
- Full test and syntax results are recorded in `TEST-REPORT-STAGE-40-ITERATION-8.md`.
- External downloader APIs and production WhatsApp delivery are not tested by these offline checks.

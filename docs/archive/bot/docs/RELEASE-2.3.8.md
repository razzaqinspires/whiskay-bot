# WhiskayBot v2.3.8

- YouTube search now has a text/number selection fallback; v2.3.9 restores the native single-select list using the project menu serializer pattern. Each result points to a preview-first command; download still requires selecting MP3/MP4.
- Added owner-only console operators: `>` async eval, `=>` async expression return, `$` shell, `>>` Python subprocess.
- Added `-f(term1, term2)` source scanner with file/path/line/character/time statistics and source preview/file retrieval commands.
- Scanner excludes node_modules, hidden files/directories, `.env`, `.dat`, `.json`, binary formats and oversized files.

Validation performed locally: syntax checks and ZIP integrity. Live WhatsApp delivery and command execution have not been tested against the user's running instance. Shell/eval/Python are powerful owner-only tools; configure OWNERS carefully.


References reviewed: [Baileys send-message docs](https://github.com/WhiskeySockets/docs/blob/main/messaging/sending-messages.mdx), [Baileys issue #2465 (list messages, Apr 4 2026)](https://github.com/WhiskeySockets/Baileys/issues/2465), and [issue #1173 (interactive buttons)](https://github.com/WhiskeySockets/Baileys/issues/1173). These issues indicate client/server compatibility concerns; they do not prove every current WhatsApp client will fail.

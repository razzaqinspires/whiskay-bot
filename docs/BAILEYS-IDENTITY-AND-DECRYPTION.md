# Baileys LID identity changes and message decryption diagnostics

## 1. `identity key changed` / `identity key changed or new contact`

These are Signal protocol identity-key notifications. They can appear when a contact/device is first seen, its encryption identity rotates, or WhatsApp re-establishes a Signal session. They are not, by themselves, proof that the bot session is corrupted. Do not delete `sessions/`, do not clear Signal keys, and do not suppress trust checks merely to hide these notices.

## 2. `critical_unblock_low ... failed to find key ...` during app-state resync

Baileys could not find a referenced app-state sync key while decoding a patch, and its snapshot retry also failed. This is distinct from the bot's command/plugin database. Preserve the auth directory for diagnosis. Check that only one primary bot process uses a given `SESSION_DIR`, that the directory is persistent and writable, and that deployments do not restore a partial mix of `creds.json` and `app-state-sync-key-*` files. Back up the complete session directory before any recovery attempt. Do not copy individual key files between sessions or manually edit them.

If it persists after a clean restart with one process and intact persistent storage, capture the Baileys version, Node version, and sanitized logs, then test a supported Baileys release in a separate backup session before replacing production dependencies. Re-linking should be a last resort after backup and explicit owner approval.

## 3. `No session found to decrypt message` / `failed to decrypt message`

This means the local Signal group sender-key session needed for that encrypted group message was unavailable. WhatsApp/Baileys may send a retry receipt (as in `sent retry receipt`) so the sender can retransmit. A one-off event can occur during device/key rotation or missed key distribution. If frequent, verify stable storage, a single active process, no session directory cleanup, and that reconnects do not overlap. Do not treat `participantAlt` as proof that decryption succeeded; it is an alternate PN identity for the LID participant.

## 4. LID and PN identities

`@lid` and `@s.whatsapp.net` are different addressing namespaces. Keep the original message key and participant identity intact for protocol operations. Use the LID-to-PN mapping only for display/lookup where appropriate; never rewrite Signal message keys or use a PN alias as a substitute cryptographic identity.

## 5. Safe operational checklist

- Run exactly one primary Whiskay process per auth directory (`SESSION_DIR`).
- Persist and back up the entire session directory atomically; exclude it from source-control and public ZIP releases.
- Ensure the runtime user can read/write the session directory.
- Do not delete `sessions/` to silence identity/decryption messages.
- Keep Baileys dependency version pinned; test upgrades on a copied session first.
- Treat isolated identity changes and retry receipts as informational; investigate repeated app-state snapshot failures or sustained decrypt failures.

const normalizeToken = value => String(value || '').trim().toLowerCase();
const sourceKey = plugin => String(plugin?.__sourceFile || plugin?.name || plugin?.command || '').toLowerCase();

/**
 * Build a deterministic command registry. The first lexical source path owns a token;
 * later collisions are reported and skipped instead of silently overwriting the owner.
 */
export function buildPluginRegistry(plugins = []) {
  const ordered = [...plugins].filter(plugin => plugin && typeof plugin === 'object').sort((a, b) => {
    const aa = sourceKey(a), bb = sourceKey(b);
    return aa < bb ? -1 : aa > bb ? 1 : 0;
  });
  const commands = new Map();
  const aliases = new Map();
  const all = new Map();
  const conflicts = [];
  const entries = [];

  for (const plugin of ordered) {
    const rawCommands = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
    const tokens = [...new Set(rawCommands.map(normalizeToken).filter(Boolean))];
    if (!tokens.length) continue;
    const stableId = normalizeToken(plugin.name || tokens[0]);
    if (all.has(stableId)) {
      conflicts.push({ type: 'duplicate-plugin-id', token: stableId, winner: sourceKey(all.get(stableId)), rejected: sourceKey(plugin) });
      continue;
    }
    all.set(stableId, plugin);
    entries.push({ plugin, stableId, commands: tokens, aliases: [...new Set((Array.isArray(plugin.aliases) ? plugin.aliases : []).map(normalizeToken).filter(Boolean))] });
  }

  for (const entry of entries) {
    for (const token of entry.commands) {
      const existing = commands.get(token);
      if (existing) {
        conflicts.push({ type: 'duplicate-command', token, winner: sourceKey(existing), rejected: sourceKey(entry.plugin) });
        continue;
      }
      commands.set(token, entry.plugin);
    }
  }

  for (const entry of entries) {
    for (const token of entry.aliases) {
      const commandOwner = commands.get(token);
      if (commandOwner) {
        conflicts.push({ type: 'alias-command-collision', token, winner: sourceKey(commandOwner), rejected: sourceKey(entry.plugin) });
        continue;
      }
      const aliasOwner = aliases.get(token);
      if (aliasOwner) {
        conflicts.push({ type: 'duplicate-alias', token, winner: sourceKey(aliasOwner), rejected: sourceKey(entry.plugin) });
        continue;
      }
      aliases.set(token, entry.plugin);
    }
  }

  return { commands, aliases, all, conflicts };
}

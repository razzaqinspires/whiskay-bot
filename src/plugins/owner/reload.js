import { registry } from '../../core/registry.js';

export default {
  name: 'reload',
  command: ['reload', 'rl'],
  category: 'owner',
  owner: true,
  cooldown: 3000,
  async execute(ctx) {
    const q = registry.reloadQueue;
    if (!q) return ctx.reply('❌ Reload queue unavailable');

    if (q.busy) await ctx.reply('⏳ Queue busy — reloading after current completes...');

    try {
      const t0 = Date.now();
      await q.push('command');
      const s = q.stats;
      const diagnostics = registry.plugins.diagnostics || { conflicts: [] };
      const conflicts = Array.isArray(diagnostics.conflicts) ? diagnostics.conflicts : [];
      const conflictPreview = conflicts.slice(0, 5).map(item => `- ${item.type}: ${item.token} (${item.winner} > ${item.rejected})`).join('\n');
      await ctx.reply(
        `♻️ *Reload Selesai*\n` +
        `⏱️ ${Date.now() - t0}ms\n` +
        `📦 Plugins: ${registry.plugins.plugins.size}\n` +
        `🎯 Commands: ${registry.plugins.commands.size}\n` +
        `⚠️ Registry conflicts: ${conflicts.length}` + (conflictPreview ? `\n${conflictPreview}` : '') + `\n` +
        `📊 Stats: ok=${s.ok} fail=${s.fail} coalesced=${s.coalesced}`
      );
    } catch (e) {
      await ctx.reply(`❌ Reload gagal: ${e.message}`);
    }
  }
};

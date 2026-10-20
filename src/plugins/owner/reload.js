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
      await ctx.reply(
        `♻️ *Reload Selesai*\n` +
        `⏱️ ${Date.now() - t0}ms\n` +
        `📦 Plugins: ${registry.plugins.plugins.size}\n` +
        `🎯 Commands: ${registry.plugins.commands.size}\n` +
        `📊 Stats: ok=${s.ok} fail=${s.fail} coalesced=${s.coalesced}`
      );
    } catch (e) {
      await ctx.reply(`❌ Reload gagal: ${e.message}`);
    }
  }
};

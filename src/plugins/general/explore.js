import { registry } from '../../core/registry.js';
import { getCommandRecommendations } from '../../lib/menu-settings.js';
import { getEnergy } from '../../lib/energy-worker.js';
const firstCommand = p => String(Array.isArray(p.menuCommands) ? p.menuCommands[0] : Array.isArray(p.command) ? p.command[0] : p.command || '').toLowerCase();
function availableFor(ctx, plugin) {
  if (!plugin || plugin.hidden || plugin.disabled) return false;
  if ((plugin.owner || plugin.category === 'owner') && !ctx.isOwner) return false;
  if (plugin.group && !ctx.isGroup) return false;
  if (plugin.private && ctx.isGroup) return false;
  if (plugin.premium && !ctx.isPremium && !ctx.isOwner) return false;
  return true;
}
export default {
  name: 'explore', command: ['explorestats', 'rekomendasi'],
  menuCommands: ['explore'], category: 'general', cooldown: 1500,
  description: 'Jelajahi command yang tersedia dan statistik rekomendasi kontekstual',
  async execute(ctx) {
    const groups = registry.plugins.listByCategory();
    const all = [];
    for (const plugins of groups.values()) for (const p of plugins) {
      if (!availableFor(ctx, p)) continue;
      const command = firstCommand(p);
      if (!command || ['modcoin','premium','setpayment','topuppending','topupapprove'].includes(command) && !ctx.isOwner) continue;
      if ((p.limitCost || p.limit) && Number((await getEnergy(ctx.sender || ctx.chat)).limit || 0) <= 0 && !ctx.isOwner) continue;
      all.push({ command, category: String(p.category || 'other'), description: String(p.description || '').slice(0, 100) });
    }
    const unique = [...new Map(all.map(x => [x.command, x])).values()];
    const personal = await getCommandRecommendations(ctx.sender || ctx.chat, unique, 10);
    const totalHits = personal.reduce((sum, x) => sum + x.count, 0);
    const lines = personal.map((x, i) => `${i + 1}. ${ctx.prefix}${x.command} — ${x.percentage}% dari penggunaan command tercatat (${x.count}x)`).join('\n');
    const coverage = unique.length;
    const body = `EXPLORE · COMMAND YANG TERSEDIA\nKonteks: ${ctx.isGroup ? 'grup' : 'chat pribadi'} · Akses: ${ctx.isOwner ? 'owner' : 'user'}\nCommand yang lolos filter konteks: ${coverage}\nCommand dengan riwayat penggunaan: ${personal.length}\nTotal penggunaan dalam sampel: ${totalHits}\n\nTOP 10 PERSONAL\n${lines || 'Belum ada riwayat yang cocok. Jalankan command yang tersedia agar rekomendasi memiliki data.'}\n\nPersentase dihitung dari penggunaan command yang cocok dan tercatat pada akun ini, bukan peluang keberhasilan. Perintah owner, premium, group-only, dan limit disaring berdasarkan metadata yang tersedia; plugin yang tidak mendeklarasikan metadata mungkin memerlukan aturan tambahan.`;
    return ctx.sendInteractive({ title: '🧭 Whiskay Explore', subtitle: 'Discovery dengan filter konteks', body, buttons: [
      { name: 'quick_reply', title: 'Refresh Explore', id: `${ctx.prefix}explore` },
      { name: 'quick_reply', title: 'Menu', id: `${ctx.prefix}menu` },
      { name: 'quick_reply', title: 'Profile', id: `${ctx.prefix}profile` }
    ] });
  }
};

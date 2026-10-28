import logger from '../../utils/logger.js';
export default {
  name: 'setlog', command: 'setlog', aliases: [], category: 'owner', owner: true,
  description: 'Mengubah tema log terminal (1 Minimalist, 2 Cyberpunk, 3 Matrix, 4 Corporate, 5 RGB Gaming).',
  async execute(ctx) {
    if (!ctx.isOwner) return ctx.reply('⛔ Perintah ini khusus owner.');
    const value = Number(String(ctx.args?.[0] ?? ctx.text?.split(/\s+/)?.[1] ?? '').trim());
    if (!Number.isInteger(value) || value < 1 || value > 5) return ctx.reply('Gunakan: .setlog <1-5>\\n1 Minimalist · 2 Cyberpunk · 3 Matrix · 4 Corporate · 5 RGB Gaming');
    const name = logger.setTheme(value);
    return ctx.reply(`✅ Tema terminal disimpan: ${name} (${value}). Perubahan aktif pada log berikutnya.`);
  }
};

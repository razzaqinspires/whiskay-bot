import { getGlobalRecommendationsEnabled, setGlobalRecommendationsEnabled } from '../../lib/menu-settings.js';
export default {
  name: 'recommendation-control',
  command: ['recommendation', 'recommendations'],
  menuCommands: ['recommendation'],
  category: 'owner', owner: true,
  description: 'Aktif/nonaktifkan tombol rekomendasi secara global',
  async execute(ctx) {
    if (!ctx.isOwner) return ctx.reply('🔒 Pengaturan rekomendasi global hanya untuk owner.');
    const value = String(ctx.args?.[0] || '').toLowerCase();
    if (!['on', 'off', 'status'].includes(value)) {
      const enabled = await getGlobalRecommendationsEnabled();
      return ctx.sendInteractive({ title: 'Rekomendasi Global', body: `Status: ${enabled ? 'ON' : 'OFF'}\nOFF menyembunyikan tombol rekomendasi dari seluruh menu. Data penggunaan tetap tersimpan dan tidak dihapus.`, buttons: [
        { name: 'quick_reply', title: 'Aktifkan', id: `${ctx.prefix}recommendation on` },
        { name: 'quick_reply', title: 'Nonaktifkan', id: `${ctx.prefix}recommendation off` },
        { name: 'quick_reply', title: 'Status', id: `${ctx.prefix}recommendation status` }
      ] });
    }
    if (value === 'status') return ctx.reply(`Rekomendasi global: ${(await getGlobalRecommendationsEnabled()) ? 'ON' : 'OFF'}`);
    const result = await setGlobalRecommendationsEnabled(value === 'on', ctx.sender);
    return ctx.reply(`Rekomendasi global ${result.enabled ? 'diaktifkan' : 'dinonaktifkan'}. Tombol menu akan ${result.enabled ? 'ditampilkan jika tersedia bagi konteks pengguna' : 'disembunyikan'}.`);
  }
};

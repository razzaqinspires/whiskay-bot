import { randomInt } from 'node:crypto';
import { renderSlotMachineV2 } from '../../services/canvas-v2.js';
const SYMBOLS = ['💎', '⭐', '🍀', '🔮', '🌙', '🐉'];
export default {
  name: 'slot-visual', command: ['slot', 'casino'], category: 'games', cooldown: 8000,
  description: 'Mini-game slot visual PNG tanpa taruhan atau uang sungguhan',
  async execute(ctx) {
    const reels = [SYMBOLS[randomInt(SYMBOLS.length)], SYMBOLS[randomInt(SYMBOLS.length)], SYMBOLS[randomInt(SYMBOLS.length)]];
    const won = reels.every(s => s === reels[0]);
    const almost = !won && new Set(reels).size === 2;
    const points = won ? 100 : almost ? 15 : 0;
    try {
      const image = await renderSlotMachineV2({ symbols: reels, won, points, playerName: ctx.pushName || 'PLAYER' });
      await ctx.sock.sendMessage(ctx.chat, { image, caption: `🎰 *LUCKY SPIRIT SLOTS*\n${won ? `✨ Tiga simbol cocok! Skor hiburan: +${points} poin.` : almost ? '🔮 Hampir! Dua simbol cocok.' : 'Coba lagi nanti.'}\n\nMode mini-game ini tidak memakai saldo, uang asli, atau top-up.` }, { quoted: ctx.raw });
    } catch (error) {
      console.error('[slot] card render failed:', error?.message || error);
      return ctx.reply('⚠️ Gambar mini-game belum bisa dirender. Pastikan FFmpeg tersedia (`ffmpeg -version`) atau pasang modul `canvas`. Tidak ada saldo yang dipotong.');
    }
  }
};

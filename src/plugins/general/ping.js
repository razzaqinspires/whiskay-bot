export default {
  command: ['ping', 'p'], category: 'general', cooldown: 2000,
  async execute(ctx) {
    const t = performance.now();
    const m = await ctx.reply('Pong...');
    await ctx.sock.sendMessage(ctx.chatId, {
      text: 'Pong!\nLatency: ' + (performance.now() - t).toFixed(2) + 'ms\nUptime: ' + Math.floor(process.uptime()) + 's',
      edit: m.key
    });
  }
};

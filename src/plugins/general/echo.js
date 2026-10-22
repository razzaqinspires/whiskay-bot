export default {
  command: 'echo', aliases: ['say'], category: 'general', energyMode: 'static', energyCost: 0.30,
  async execute(ctx) {
    if (!ctx.text) return ctx.reply('Usage: echo <text>');
    await ctx.reply(ctx.text);
  }
};

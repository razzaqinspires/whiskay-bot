import util from 'node:util';
export default {
  command: 'eval', category: 'owner', owner: true,
  async execute(ctx) {
    if (!ctx.text) return ctx.reply('Usage: eval <code>');
    try {
      let r = await eval('(async () => { ' + ctx.text + ' })()');
      if (typeof r !== 'string') r = util.inspect(r, { depth: 2 });
      await ctx.reply('OK\n' + r);
    } catch (e) {
      await ctx.reply('ERR: ' + e.message);
    }
  }
};

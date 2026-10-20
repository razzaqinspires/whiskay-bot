import util from 'node:util';
export default {
  command: 'eval', category: 'owner', owner: true,
  async execute(ctx) {
    if (!ctx.text) return ctx.reply('Usage: eval <code>');
    try {
      const m = ctx.m || ctx.message || ctx;
      const sock = ctx.sock || ctx.client || null;
      const sendMessage = (jid, content, options = {}) => {
        if (!sock?.sendMessage) throw new Error('sock.sendMessage tidak tersedia');
        return sock.sendMessage(jid || ctx.chat, content, options);
      };
      const reply = (...args) => ctx.reply(...args);
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      let r = await new AsyncFunction('ctx', 'm', 'sock', 'sendMessage', 'reply', 'process', 'util', '"use strict"; ' + ctx.text)(
        ctx, m, sock, sendMessage, reply, process, util
      );
      if (typeof r !== 'string') r = util.inspect(r, { depth: 2 });
      await ctx.reply('OK\n' + r);
    } catch (e) {
      await ctx.reply('ERR: ' + e.message);
    }
  }
};

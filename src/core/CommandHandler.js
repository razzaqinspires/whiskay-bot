import { MiddlewareChain } from './Middleware.js';
import Logger from './Logger.js';
import config from '../config/index.js';
import { recordCommandUsage } from '../lib/menu-settings.js';

export class CommandHandler {
  constructor(pm) { this._pm = pm; this._base = new MiddlewareChain(); }
  use(mw) { this._base.use(mw); return this; }

  parse(ctx) {
    const b = (ctx.body || '').trim();
    if (!b) return false;
    const pre = config.prefixes.find(p => b.startsWith(p));
    if (!pre) return false;
    const parts = b.slice(pre.length).split(/\s+/);
    const cmd = parts[0], args = parts.slice(1);
    if (!cmd) return false;
    const p = this._pm.resolve(cmd);
    if (!p) return false;
    ctx.prefix = pre;
    ctx.command = cmd.toLowerCase();
    ctx.args = args;
    ctx.text = args.join(' ');
    ctx.plugin = p;
    return true;
  }

  async handle(ctx) {
    if (!this.parse(ctx)) return false;
    const chain = new MiddlewareChain();
    for (const mw of this._base.stack) chain.use(mw);
    const p = ctx.plugin;

    // Owner check now uses serializer's LID-aware flag
    if (p.owner && !ctx.isOwner) { await ctx.reply('🔒 Owner only'); return true; }
    if (p.group && !ctx.isGroup) { await ctx.reply('👥 Group only'); return true; }
    if (p.private && ctx.isGroup) { await ctx.reply('📩 Private only'); return true; }

    const ok = await chain.run(ctx);
    if (!ok || ctx.aborted) return true;

    try {
      const t0 = performance.now();
      await p.execute(ctx);
      await recordCommandUsage(ctx.sender || ctx.chat, p.menuCommands?.[0] || (Array.isArray(p.command) ? p.command[0] : p.command) || ctx.command).catch(() => {});
      Logger.debug(`${ctx.command} -> ${(performance.now() - t0).toFixed(2)}ms`);
    } catch (e) {
      Logger.error({ cmd: ctx.command, err: e.message }, 'cmd error');
      await ctx.reply('❌ ' + e.message).catch(() => {});
    }
    return true;
  }
}

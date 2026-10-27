import { MiddlewareChain } from './Middleware.js';
import Logger from './Logger.js';
import config from '../config/index.js';
import { recordCommandUsage } from '../lib/menu-settings.js';
import { hasPremium } from '../lib/energy-worker.js';
import { getUser } from '../lib/app-database.js';

export class CommandHandler {
  constructor(pm) { this._pm = pm; this._base = new MiddlewareChain(); }
  use(mw) { this._base.use(mw); return this; }

  parse(ctx) {
    const b = (ctx.body || '').trim();
    if (!b) return false;

    // Owner console operators: >> Python, => async eval-return, > async eval, $ shell.
    // These operators are intentionally routed through the same owner-gated plugin.
    const operator = b.startsWith('>>') ? 'python' : b.startsWith('=>') ? 'return' : b.startsWith('>') ? 'eval' : b.startsWith('$') ? 'exec' : null;
    if (operator) {
      const code = b.slice(operator === 'python' || operator === 'return' ? 2 : 1).trim();
      const p = this._pm.resolve('console');
      if (!p) return false;
      ctx.prefix = operator === 'python' ? '>>' : operator === 'return' ? '=>' : operator === 'eval' ? '>' : '$';
      ctx.command = 'console';
      ctx.args = code ? [code] : [];
      ctx.text = code;
      ctx.consoleMode = operator;
      ctx.plugin = p;
      return true;
    }

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

    // Central registration gate: avoids editing every plugin. Message handler observes users
    // with registered=false; only explicit .daftar changes that state to true.
    const allowBeforeRegistration = new Set(['daftar','register','statusdaftar','menu','help','owner','ping','start']);
    if (String(process.env.REQUIRE_USER_REGISTRATION || 'true').toLowerCase() !== 'false') {
      const user = await getUser(ctx.sender || ctx.chat).catch(() => null);
      if (!user?.registered && !allowBeforeRegistration.has(String(ctx.command || '').toLowerCase()) && !ctx.isOwner) {
        await ctx.reply('🔐 Kamu belum terdaftar. Gunakan .daftar terlebih dahulu. Pesanmu sudah tercatat sebagai pengguna belum terdaftar; registrasi tidak dilakukan otomatis.');
        return true;
      }
      if (user?.banned && !ctx.isOwner && !['daftar','statusdaftar','owner'].includes(String(ctx.command || '').toLowerCase())) {
        await ctx.reply('⛔ Akun kamu diblokir dari penggunaan command. Hubungi owner jika ini keliru.');
        return true;
      }
    }

    // Owner check now uses serializer's LID-aware flag
    if (p.owner && !ctx.isOwner) { await ctx.reply('🔒 Owner only'); return true; }
    if (p.group && !ctx.isGroup) { await ctx.reply('👥 Group only'); return true; }
    if (p.private && ctx.isGroup) { await ctx.reply('📩 Private only'); return true; }
    if (p.premium && !await hasPremium(ctx.sender || ctx.chat).catch(() => false)) { await ctx.reply('💎 Perintah ini khusus pengguna Premium yang masih aktif.'); return true; }

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

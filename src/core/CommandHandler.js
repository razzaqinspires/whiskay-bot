import stage24Logger from '../utils/logger.js';
import { MiddlewareChain } from './Middleware.js';
import Logger from './Logger.js';
import config from '../config/index.js';
import { recordCommandUsage } from '../lib/menu-settings.js';
import { hasPremium } from '../lib/energy-worker.js';
import { getUser } from '../lib/app-database.js';
import { getTypoSettings, suggestCommands } from './typo-suggestions.js';
import { checkNsfwAccess } from '../lib/nsfw-gate.js';
import { getWorkloadShard } from './WorkloadCortex.js';
import { isCommandQuarantined, recordCommandFailure } from './FailureMemoryShard.js';
import { awardCommandXP } from '../lib/leveling.js';

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
    if (!p) { ctx.unknownCommand = cmd.toLowerCase(); ctx.unknownPrefix = pre; return false; }
    ctx.prefix = pre;
    ctx.command = cmd.toLowerCase();
    ctx.args = args;
    ctx.text = args.join(' ');
    ctx.plugin = p;
    return true;
  }

  async handle(ctx) {
    if (!this.parse(ctx)) {
      if (ctx.unknownCommand && !ctx.isBot) {
        try { const settings = await getTypoSettings(); if (settings.enabled) { const candidates = await suggestCommands(ctx.unknownCommand, [...this._pm.commands.keys(), ...this._pm._alias.keys()]); if (candidates.length) { const buttons = candidates.map(x => ({ name: 'quick_reply', title: `${ctx.unknownPrefix}${x.command} · ${x.percentage}%`, id: `${ctx.unknownPrefix}${x.command}` })); await ctx.sendInteractive({ title: 'Mungkin yang kamu maksud?', body: `Perintah \`${ctx.unknownPrefix}${ctx.unknownCommand}\` tidak ditemukan.

${candidates.map(x => `• ${ctx.unknownPrefix}${x.command} — kemiripan ${x.percentage}%`).join('\n')}\n\nPersentase adalah kemiripan teks, bukan probabilitas niat.`, buttons }); return true; } } } catch {}
      }
      return false;
    }
    try { stage24Logger.command(ctx.sender || ctx.chat || 'unknown', `${ctx.prefix || ''}${ctx.command || ''}`); } catch {}
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
    if (p.premium && !ctx.isOwner && !await hasPremium(ctx.sender || ctx.chat).catch(() => false)) { await ctx.reply('💎 Perintah ini khusus pengguna Premium yang masih aktif.'); return true; }

    if (String(p.category || '').toLowerCase() === 'nsfw' || p.nsfw === true) { const mem=process.memoryUsage(); const shard=getWorkloadShard({heapUsedMB:mem.heapUsed/1048576,heapTotalMB:mem.heapTotal/1048576}); const gate=await checkNsfwAccess({ctx,workloadState:shard.state}); if(!gate.ok){const messages={'disabled':'Fitur NSFW dinonaktifkan oleh owner.','global-pause':'NSFW sedang dihentikan melalui global pause.','workload-critical':'🔒 NSFW dikunci otomatis karena workload CRITICAL, termasuk untuk owner.','group-opt-in-required':'Grup belum opt-in ke fitur ini.','admin-required':'Di grup, fitur ini hanya tersedia untuk admin.','tokens-empty':'Token NSFW habis. Hubungi owner untuk alokasi token.'}; await ctx.sendInteractive({title:'🔒 NSFW Access Gate',body:messages[gate.reason]||'Akses ditolak oleh policy.',buttons:[{name:'quick_reply',title:'Status NSFW',id:`${ctx.prefix}nsfw status`},{name:'quick_reply',title:'Menu',id:`${ctx.prefix}menu`}]});return true;}ctx.nsfwAccess=gate; }

    if (!ctx.isOwner && await isCommandQuarantined(ctx.command).catch(() => false)) { await ctx.sendInteractive({title:'🛡️ Command Dikarantina',body:`${ctx.prefix}${ctx.command} mengalami kegagalan berulang dan sementara dikunci selama 30 menit. Owner dapat memeriksa .quarantine list.`,buttons:[{name:'quick_reply',title:'Lihat Menu',id:`${ctx.prefix}menu`},{name:'quick_reply',title:'Hubungi Owner',id:`${ctx.prefix}owner`}]}); return true; }

    const ok = await chain.run(ctx);
    if (!ok || ctx.aborted) return true;

    try {
      const t0 = performance.now();
      await p.execute(ctx);
      await recordCommandUsage(ctx.sender || ctx.chat, p.menuCommands?.[0] || (Array.isArray(p.command) ? p.command[0] : p.command) || ctx.command).catch(() => {});
      if (!ctx.isBot && ctx.sender && !['daftar','register','statusdaftar'].includes(ctx.command)) {
        const xp = await awardCommandXP(ctx.chat || ctx.sender, ctx.sender, ctx.command).catch(() => null);
        if (xp?.leveled && xp.profile?.notifyLevelUp !== false) {
          await ctx.sendInteractive({ title:'⭐ LEVEL UP!', subtitle:`Level ${xp.from} → ${xp.to}`, body:`Perintah berhasil dijalankan dan kamu memperoleh +${xp.gain} XP.\nLevel baru: ${xp.to} · ${xp.profile.xp}/${xp.needed} XP menuju level berikutnya.`, buttons:[{name:'quick_reply',title:'Lihat Profil',id:`${ctx.prefix}profile`},{name:'quick_reply',title:'Leaderboard',id:`${ctx.prefix}leaderboard`}] }).catch(()=>{});
        }
      }
      Logger.debug(`${ctx.command} -> ${(performance.now() - t0).toFixed(2)}ms`);
    } catch (e) {
      Logger.error({ cmd: ctx.command, err: e.message }, 'cmd error');
      const shard = await recordCommandFailure(ctx.command, e).catch(() => null);
      if (shard?.quarantinedUntil > Date.now()) Logger.error({ cmd: ctx.command, quarantinedUntil: shard.quarantinedUntil }, 'command quarantined after repeated failures');
      await ctx.reply('❌ ' + e.message).catch(() => {});
    }
    return true;
  }
}

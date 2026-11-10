import stage24Logger from '../utils/logger.js';
import { MiddlewareChain } from './Middleware.js';
import Logger from './Logger.js';
import config from '../config/index.js';
import { recordCommandUsage } from '../lib/menu-settings.js';
import { hasPremium } from '../lib/energy-worker.js';
import { clearExpiredUserBan } from '../lib/app-database.js';
import { getTypoSettings, suggestCommands } from './typo-suggestions.js';
import { checkNsfwAccess } from '../lib/nsfw-gate.js';
import { getWorkloadShard } from './WorkloadCortex.js';
import { isCommandQuarantined, recordCommandFailure } from './FailureMemoryShard.js';
import { awardCommandXP } from '../lib/leveling.js';
import { registry } from './registry.js';
import { shouldBlockForOffline, formatOfflineStatus } from '../lib/offline-mode.js';
import { getGroupSettings } from '../lib/group-settings.js';
import { runWithOutboundContext } from './OutboundTrafficGuard.js';
import { workloadTracker } from './WorkloadTracker.js';
import { recordNextoraFailure } from '../services/nextora-repair/NextoraRepairService.js';

const offlineNoticeAt = new Map();
const OFFLINE_NOTICE_COOLDOWN_MS = 30 * 60 * 1000;

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
    // Defense in depth: no caller may dispatch a self-authored WhatsApp echo.
    if (!ctx || ctx.isBot || ctx.fromMe || ctx.raw?.key?.fromMe) return true;
    if (!this.parse(ctx)) {
      if (ctx.unknownCommand && !ctx.isBot) {
        try { const settings = await getTypoSettings(); if (settings.enabled) { const candidates = await suggestCommands(ctx.unknownCommand, [...this._pm.commands.keys(), ...this._pm._alias.keys()]); if (candidates.length) { const buttons = candidates.map(x => ({ name: 'quick_reply', title: `${ctx.unknownPrefix}${x.command} · ${x.percentage}%`, id: `${ctx.unknownPrefix}${x.command}` })); await ctx.sendInteractive({ title: 'Mungkin yang kamu maksud?', body: `Perintah \`${ctx.unknownPrefix}${ctx.unknownCommand}\` tidak ditemukan.

${candidates.map(x => `• ${ctx.unknownPrefix}${x.command} — kemiripan ${x.percentage}%`).join('\n')}\n\nPersentase adalah kemiripan teks, bukan probabilitas niat.`, buttons }); return true; } } } catch {}
      }
      return false;
    }
    const releasePluginLease = this._pm.acquire?.(ctx.plugin) || (() => {});
    try {
      try { stage24Logger.command(ctx.sender || ctx.chat || 'unknown', `${ctx.prefix || ''}${ctx.command || ''}`); } catch {}
    const chain = new MiddlewareChain();
    for (const mw of this._base.stack) chain.use(mw);
    const p = ctx.plugin;

    // Offline mode is persistent and blocks user commands while preserving owner access.
    const offlineStatus = registry.runtimeState?.get?.('offlineMode', null);
    if (shouldBlockForOffline({ status: offlineStatus, isOwner: ctx.isOwner, command: ctx.command })) {
      const key = String(ctx.sender || ctx.chat || 'unknown');
      const now = Date.now();
      const lastNotice = offlineNoticeAt.get(key) || 0;
      if (now - lastNotice >= OFFLINE_NOTICE_COOLDOWN_MS) {
        offlineNoticeAt.set(key, now);
        await ctx.reply(formatOfflineStatus(offlineStatus));
      }
      return true;
    }

    // Moderation applies regardless of the optional registration policy. Timed bans
    // expire lazily on the target's next command; legacy bans with no banUntil stay permanent.
    const commandName = String(ctx.command || '').toLowerCase();
    if (ctx.isGroup && !ctx.isAdmin && !ctx.isOwner) {
      const groupSettings = await getGroupSettings(ctx.chat).catch(() => null);
      const blocked = new Set(groupSettings?.cmdblocked || []);
      const moderationEscape = new Set(['bancmd','unbancmd','grouphelp','groupstatus','groupinfo','menu','help','ping','owner','admins']);
      if (blocked.has(commandName) && !moderationEscape.has(commandName)) {
        await ctx.reply(`🚫 Command .${commandName} diblokir oleh admin grup ini.`);
        return true;
      }
    }
    const banCheck = await clearExpiredUserBan(ctx.sender || ctx.chat).catch(() => ({ user: null, expired: false }));
    const user = banCheck.user;
    if (user?.banned && !ctx.isOwner && !['daftar','statusdaftar','owner'].includes(commandName)) {
      const until = Number(user.banUntil || 0);
      const reason = user.banReason ? ` Alasan: ${String(user.banReason).slice(0, 180)}` : '';
      await ctx.reply(`⛔ Akun kamu diblokir dari penggunaan command.${until ? ` Ban berakhir: ${new Date(until).toLocaleString('id-ID', { hour12: false })}.` : ' Ban berlaku permanen.'}${reason} Hubungi owner jika ini keliru.`);
      return true;
    }

    // Registration is an independent policy and can be disabled without disabling bans.
    const allowBeforeRegistration = new Set(['daftar','register','statusdaftar','menu','help','owner','ping','start']);
    if (String(process.env.REQUIRE_USER_REGISTRATION || 'true').toLowerCase() !== 'false') {
      if (!user?.registered && !allowBeforeRegistration.has(commandName) && !ctx.isOwner) {
        await ctx.reply('🔐 Kamu belum terdaftar. Gunakan .daftar terlebih dahulu. Pesanmu sudah tercatat sebagai pengguna belum terdaftar; registrasi tidak dilakukan otomatis.');
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

    const commandStartedAt = performance.now();
    const commandInvocationId = workloadTracker.beginCommandInvocation({ command: ctx.command, actor: ctx.sender || ctx.chat || 'unknown' });
    let commandSucceeded = true;
    try {
      const t0 = performance.now();
      await runWithOutboundContext({ source: `command:${ctx.command}`, command: ctx.command, sender: ctx.sender || '', chat: ctx.chat || '' }, () => p.execute(ctx));
      await recordCommandUsage(ctx.sender || ctx.chat, p.menuCommands?.[0] || (Array.isArray(p.command) ? p.command[0] : p.command) || ctx.command).catch(() => {});
      if (!ctx.suppressPostCommandXp && !ctx.isBot && ctx.sender && !['daftar','register','statusdaftar'].includes(ctx.command)) {
        const xp = await awardCommandXP(ctx.chat || ctx.sender, ctx.sender, ctx.command).catch(() => null);
        ctx.xpAward = xp;
        if (xp?.leveled && xp.profile?.notifyLevelUp !== false) {
          await runWithOutboundContext({ source: `command:${ctx.command}:level-up`, command: ctx.command }, () => ctx.sendInteractive({ title:'⭐ LEVEL UP!', subtitle:`Level ${xp.from} → ${xp.to}`, body:`Perintah berhasil dijalankan dan kamu memperoleh +${xp.gain} XP.\nLevel baru: ${xp.to} · ${xp.profile.xp}/${xp.needed} XP menuju level berikutnya.`, buttons:[{name:'quick_reply',title:'Lihat Profil',id:`${ctx.prefix}profile`},{name:'quick_reply',title:'Leaderboard',id:`${ctx.prefix}leaderboard`}] })).catch(()=>{});
        }
      }
      Logger.debug(`${ctx.command} -> ${(performance.now() - t0).toFixed(2)}ms`);
    } catch (e) {
      commandSucceeded = false;
      Logger.error({ cmd: ctx.command, err: e.message }, 'cmd error');
      const shard = await recordCommandFailure(ctx.command, e).catch(() => null);
      if (shard?.quarantinedUntil > Date.now()) Logger.error({ cmd: ctx.command, quarantinedUntil: shard.quarantinedUntil }, 'command quarantined after repeated failures');
      await ctx.reply('❌ Perintah gagal diproses. Error sudah dicatat untuk dianalisis Nextora.').catch(() => {});
      try {
        const stack = String(e?.stack || '');
        const sourceMatch = stack.match(/(?:[A-Za-z]:)?[^\s()]*?((?:src\/plugins|src\/services)\/[A-Za-z0-9_./-]+\.js)/);
        const sourceFile = sourceMatch?.[1] || (p.__sourceFile ? `src/plugins/${p.__sourceFile}` : null);
        const repairTask = await recordNextoraFailure({
          command: ctx.command, error: e?.message || String(e), stack,
          sourceFile, correlationId: ctx.correlationId, chat: ctx.chat, sender: ctx.sender
        });
        for (const ownerJid of [...new Set([...(config.owners || []), ...(config.ownerLids || [])])]) {
          if (!ctx.sock?.sendInteractive) continue;
          await ctx.sock.sendInteractive(ownerJid, {
            title: 'NEXORA · Command Error Detected',
            body: `Command: ${ctx.prefix}${ctx.command}\nError: ${String(e?.message || e).slice(0, 300)}\nTask: ${repairTask.id}\n\nNextora sudah mencatat error dan menunggu pemeriksaan owner.`,
            footer: 'Owner-only · Source belum diubah',
            buttons: [{ name: 'quick_reply', title: 'Perbaiki dengan Nexora', id: `${ctx.prefix || '.'}nextora inspect ${repairTask.id}` }]
          }).catch(() => {});
        }
      } catch (repairError) {
        Logger.warn({ cmd: ctx.command, err: repairError?.message || String(repairError) }, 'Nextora repair task capture failed');
      }
    } finally {
      const commandDurationMs = performance.now() - commandStartedAt;
      workloadTracker.finishCommandInvocation(commandInvocationId, { ok: commandSucceeded, durationMs: commandDurationMs });
      await runWithOutboundContext({ source: `command:${ctx.command}:completion`, command: ctx.command }, () => ctx.completeEnergyTelemetry?.({ durationMs: commandDurationMs, ok: commandSucceeded })).catch(error => Logger.error({ cmd: ctx.command, err: error.message }, 'energy telemetry finalize failed'));
    }
    return true;
    } finally {
      releasePluginLease();
    }
  }
}

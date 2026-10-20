import { registry } from '../../core/registry.js';

const HELP = [
  '*🔥 Hot Reload Control*',
  '',
  '  `.hotreload`              → status',
  '  `.hotreload on`           → aktifkan',
  '  `.hotreload off`          → matikan',
  '  `.hotreload toggle`       → balik',
  '  `.hotreload queue`        → stats queue',
  '  `.hotreload clear`        → reset state persist',
  '',
  '_Auto-reload plugin tanpa restart runtime._'
].join('\n');

function fmt(active, q, state) {
  const persisted = state?.get('watchPlugins', null);
  return [
    '👁️  *Hot Reload Status*',
    '',
    `Active     : ${active ? '✅ ON' : '❌ OFF'}`,
    `Persisted  : ${persisted === null ? '(none)' : (persisted ? 'ON' : 'OFF')}`,
    `Plugin dir : ${registry.config?.pluginDir || '-'}`,
    '',
    '📊 *Reload Queue*',
    `Busy       : ${q?.busy ? 'Yes' : 'No'}`,
    `Runs       : ${q?.stats.runs ?? 0}`,
    `OK / Fail  : ${q?.stats.ok ?? 0} / ${q?.stats.fail ?? 0}`,
    `Coalesced  : ${q?.stats.coalesced ?? 0}`,
    `Last dur.  : ${q?.stats.lastDuration ?? 0}ms`,
    `Last reason: ${q?.stats.lastReason ?? '-'}`
  ].join('\n');
}

export default {
  name: 'hotreload',
  command: ['hotreload', 'hr'],
  aliases: ['watch2'],
  category: 'owner',
  owner: true,
  cooldown: 2000,
  description: 'Toggle auto hot-reload runtime',
  async execute(ctx) {
    const bot = registry.bot;
    if (!bot) return ctx.reply('❌ Bot instance not in registry');

    const sub = (ctx.args[0] || '').toLowerCase();
    const q = registry.reloadQueue;
    const st = registry.runtimeState;

    // STATUS
    if (!sub || sub === 'status') {
      return ctx.reply(fmt(bot.watcherActive, q, st));
    }

    // HELP
    if (sub === 'help' || sub === '-h' || sub === '--help') {
      return ctx.reply(HELP);
    }

    // ON
    if (sub === 'on' || sub === 'start' || sub === 'enable') {
      if (bot.watcherActive) return ctx.reply('✅ Hot-reload sudah aktif');
      await bot.enableWatcher();
      return ctx.reply('👁️  *Hot-reload ENABLED*\nPlugin baru otomatis di-load tanpa restart.');
    }

    // OFF
    if (sub === 'off' || sub === 'stop' || sub === 'disable') {
      if (!bot.watcherActive) return ctx.reply('🚫 Hot-reload sudah nonaktif');
      await bot.disableWatcher();
      return ctx.reply('🚫 *Hot-reload DISABLED*\nGunakan `.reload` untuk manual reload.');
    }

    // TOGGLE
    if (sub === 'toggle' || sub === 'switch') {
      const r = await bot.toggleWatcher();
      return ctx.reply(r.active
        ? '👁️  Hot-reload → *ENABLED*'
        : '🚫 Hot-reload → *DISABLED*');
    }

    // QUEUE STATS
    if (sub === 'queue' || sub === 'stats') {
      const s = q?.stats || {};
      return ctx.reply(
        '*📊 Reload Queue Stats*\n' +
        `Busy      : ${q?.busy ? 'Yes' : 'No'}\n` +
        `Runs      : ${s.runs ?? 0}\n` +
        `OK        : ${s.ok ?? 0}\n` +
        `Fail      : ${s.fail ?? 0}\n` +
        `Coalesced : ${s.coalesced ?? 0}\n` +
        `Last dur  : ${s.lastDuration ?? 0}ms`
      );
    }

    // CLEAR PERSISTENCE
    if (sub === 'clear' || sub === 'reset') {
      st.set('watchPlugins', null);
      return ctx.reply('🧹 State persist di-reset. Restart akan fallback ke `.env`.');
    }

    // Manual trigger reload
    if (sub === 'now' || sub === 'reload') {
      await q.push('manual-toggle');
      return ctx.reply('♻️ Manual reload triggered via queue');
    }

    // Unknown sub
    return ctx.reply(`❓ Sub-command tidak dikenal: *${sub}*\n\n${HELP}`);
  }
};

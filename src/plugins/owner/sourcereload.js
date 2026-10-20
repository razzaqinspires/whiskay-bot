import { registry } from '../../core/registry.js';

const HELP = [
  '*Source Hot-Reload (Core Files)*',
  '',
  '  .sourcereload              - status',
  '  .sourcereload on           - aktifkan',
  '  .sourcereload off          - matikan',
  '  .sourcereload toggle       - balik',
  '  .sourcereload now          - restart paksa',
  '  .sourcereload mode         - deteksi supervisor',
  '  .sourcereload clear        - reset persist',
  '  .sourcereload history      - riwayat restart',
  '',
  'Memantau src/**.js kecuali src/plugins/.',
  'Beda dengan .hotreload yang khusus plugin.',
  '',
  'Perubahan di core file memicu RESTART penuh.'
].join('\n');

const yn = v => v ? 'ON' : 'OFF';

export default {
  name: 'sourcereload',
  command: ['sourcereload', 'sreload'],
  aliases: ['srcwatch'],
  category: 'owner',
  owner: true,
  cooldown: 3000,
  description: 'Auto-restart pada perubahan core files',
  async execute(ctx) {
    const bot = registry.bot;
    if (!bot) return ctx.reply('Bot instance tidak tersedia');

    const sub = (ctx.args[0] || '').toLowerCase();
    const sw = registry.sourceWatcher;
    const rm = registry.restartManager;
    const st = registry.runtimeState;

    if (sub === 'help' || sub === '-h' || sub === '--help') return ctx.reply(HELP);

    if (sub === 'mode') {
      return ctx.reply(
        'Restart Mode\n' +
        'Supervisor : ' + (rm?.supervisor || '-') + '\n' +
        'Restarting : ' + (rm?._restarting ? 'Yes' : 'No') + '\n' +
        'Total hist : ' + (rm?.stats?.total ?? 0) + '\n\n' +
        'pm2/systemd: pakai process.exit(0)\n' +
        'standalone: spawn detached child'
      );
    }

    if (sub === 'history') {
      const hist = rm?.stats?.history || [];
      if (!hist.length) return ctx.reply('Belum ada riwayat restart');
      const lines = ['Restart History', ''];
      for (const h of hist) {
        lines.push('* ' + h.t);
        lines.push('  reason: ' + h.reason);
        lines.push('  supervisor: ' + h.supervisor);
        if (h.files?.length) lines.push('  files: ' + h.files.slice(0, 3).join(', '));
        lines.push('');
      }
      return ctx.reply(lines.join('\n'));
    }

    if (!sub || sub === 'status') {
      const persisted = st?.get('sourceReload', null);
      const s = sw?.stats || {};
      const lines = [
        'Source Hot-Reload Status',
        '',
        'Active     : ' + (sw ? 'ON' : 'OFF'),
        'Persisted  : ' + (persisted === null ? '(none)' : (persisted ? 'ON' : 'OFF')),
        'Dir        : ' + (s.dir || '-'),
        'Debounce   : ' + (s.debounceMs || 0) + 'ms',
        'Events     : ' + (s.totalEvents || 0),
        'Uptime     : ' + Math.floor((s.uptimeMs || 0) / 1000) + 's',
        '',
        'Supervisor : ' + (rm?.supervisor || '-'),
        '',
        'Watch: src/**.js (kecuali src/plugins/)',
        'Ignore: .json .jsonl .log .db .sqlite .bak .tmp'
      ];
      return ctx.reply(lines.join('\n'));
    }

    if (sub === 'on' || sub === 'start' || sub === 'enable') {
      if (bot.sourceWatcherActive) return ctx.reply('Source hot-reload sudah aktif');
      await bot.enableSourceWatcher();
      return ctx.reply('Source hot-reload ENABLED\nPerubahan di src/ (selain plugins) akan memicu auto-restart.');
    }

    if (sub === 'off' || sub === 'stop' || sub === 'disable') {
      if (!bot.sourceWatcherActive) return ctx.reply('Source hot-reload sudah nonaktif');
      await bot.disableSourceWatcher();
      return ctx.reply('Source hot-reload DISABLED');
    }

    if (sub === 'toggle') {
      const r = await bot.toggleSourceWatcher();
      return ctx.reply(r.active ? 'Source hot-reload -> ENABLED' : 'Source hot-reload -> DISABLED');
    }

    if (sub === 'now' || sub === 'restart') {
      await ctx.reply('Triggering restart...');
      try {
        await rm.restart({ reason: 'manual-command', files: [] });
      } catch (e) {
        await ctx.reply('Error: ' + e.message);
      }
      return;
    }

    if (sub === 'clear' || sub === 'reset') {
      st?.set('sourceReload', null);
      return ctx.reply('State persist source reload di-reset.');
    }

    return ctx.reply('Sub tidak dikenal: ' + sub + '\n\n' + HELP);
  }
};

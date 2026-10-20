import { registry } from '../../core/registry.js';
import { fmtBytes } from '../../core/AutoCleaner.js';

const HELP = [
  '*🧹 AutoClean Control*',
  '',
  '  `.autoclean`              → status',
  '  `.autoclean on`           → aktifkan sweep',
  '  `.autoclean off`          → matikan',
  '  `.autoclean toggle`       → balik',
  '  `.autoclean now`          → sweep sekarang',
  '  `.autoclean preview`      → lihat file yang akan dihapus',
  '  `.autoclean interval 60s` → set interval',
  '  `.autoclean stats`        → statistik lengkap',
  '  `.autoclean clear`        → reset persist',
  '',
  '_Patterns: .bak .tmp .swp .swo .orig .old ~ .save_'
].join('\n');

function fmtTime(iso) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch { return iso; }
}

function parseDuration(v) {
  const m = String(v || '').match(/^(\d+)\s*(s|m|h)?$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = (m[2] || 's').toLowerCase();
  return n * ({ s: 1000, m: 60_000, h: 3_600_000 }[unit]);
}

export default {
  name: 'autoclean',
  command: ['autoclean', 'cleaner', 'clean'],
  category: 'owner',
  owner: true,
  cooldown: 2000,
  description: 'Auto-hapus .bak/.tmp/.swp files',
  async execute(ctx) {
    const bot = registry.bot;
    const cleaner = registry.autoCleaner;
    if (!bot || !cleaner) return ctx.reply('❌ AutoCleaner tidak tersedia');

    const sub = (ctx.args[0] || '').toLowerCase();
    const st = registry.runtimeState;

    // HELP
    if (sub === 'help' || sub === '-h' || sub === '--help') return ctx.reply(HELP);

    // STATUS (default)
    if (!sub || sub === 'status') {
      const s = cleaner.stats;
      const persisted = st?.get('autoClean', null);
      const lines = [
        '🧹 *AutoClean Status*',
        '',
        `Active     : ${cleaner.active ? '✅ ON' : '❌ OFF'}`,
        `Persisted  : ${persisted === null ? '(none)' : (persisted ? 'ON' : 'OFF')}`,
        `Interval   : ${Math.round(s.intervalMs / 1000)}s`,
        `Paths      : ${s.paths.join(', ')}`,
        `Busy       : ${cleaner.busy ? 'Yes' : 'No'}`,
        '',
        '📊 *Stats*',
        `Scans      : ${s.scans}`,
        `Deleted    : ${s.deleted} file(s)`,
        `Freed      : ${s.bytesFreedHuman}`,
        `Last run   : ${fmtTime(s.lastRun)} (${s.lastDuration}ms)`,
        `Last reason: ${s.lastReason || '-'}`,
        s.lastError ? `⚠️  Error: ${s.lastError}` : null,
        '',
        '_Patterns: .bak .tmp .swp .swo .orig .old ~ .save_'
      ].filter(Boolean);
      return ctx.reply(lines.join('\n'));
    }

    // ON
    if (sub === 'on' || sub === 'start' || sub === 'enable') {
      if (cleaner.active) return ctx.reply('✅ AutoClean sudah aktif');
      await bot.enableAutoClean();
      return ctx.reply('🧹 *AutoClean ENABLED*\nSweep otomatis setiap ' + Math.round(cleaner.intervalMs / 1000) + 's.');
    }

    // OFF
    if (sub === 'off' || sub === 'stop' || sub === 'disable') {
      if (!cleaner.active) return ctx.reply('🚫 AutoClean sudah nonaktif');
      await bot.disableAutoClean();
      return ctx.reply('🚫 *AutoClean DISABLED*\nGunakan `.autoclean now` untuk sweep manual.');
    }

    // TOGGLE
    if (sub === 'toggle') {
      const r = await bot.toggleAutoClean();
      return ctx.reply(r.active ? '🧹 AutoClean → *ENABLED*' : '🚫 AutoClean → *DISABLED*');
    }

    // NOW — sweep sekali
    if (sub === 'now' || sub === 'run' || sub === 'sweep') {
      await ctx.reply('🧹 Sweeping...');
      const r = await cleaner.runOnce({ reason: 'manual' });
      if (r.skipped) return ctx.reply('⏳ Sweep sedang berjalan');
      if (!r.deleted.length) return ctx.reply('✨ Tidak ada file yang perlu dibersihkan');
      const lines = [
        '🧹 *Sweep Selesai*',
        `📦 Deleted : ${r.deleted.length} file(s)`,
        `💾 Freed   : ${fmtBytes(r.bytes)}`,
        `⏱️  ${r.duration}ms`,
        '',
        '📄 File:'
      ];
      for (const d of r.deleted.slice(0, 15)) lines.push(`   • \`${d.file}\``);
      if (r.deleted.length > 15) lines.push(`   … +${r.deleted.length - 15} more`);
      return ctx.reply(lines.join('\n'));
    }

    // PREVIEW — dry-run
    if (sub === 'preview' || sub === 'dry') {
      const files = await cleaner.preview();
      if (!files.length) return ctx.reply('✨ Tidak ada file yang match pattern');
      const total = files.reduce((a, f) => a + f.size, 0);
      const lines = [
        `🔍 *Preview* — ${files.length} file(s)`,
        `💾 ${fmtBytes(total)}`,
        ''
      ];
      for (const f of files.slice(0, 20)) lines.push(`   • \`${f.file}\` (${f.size}B)`);
      if (files.length > 20) lines.push(`   … +${files.length - 20} more`);
      lines.push('', 'Ketik `.autoclean now` untuk hapus.');
      return ctx.reply(lines.join('\n'));
    }

    // STATS
    if (sub === 'stats') {
      const s = cleaner.stats;
      return ctx.reply(
        '*📊 AutoClean Stats*\n' +
        `Active   : ${cleaner.active ? '✅ ON' : '❌ OFF'}\n` +
        `Scans    : ${s.scans}\n` +
        `Deleted  : ${s.deleted} files\n` +
        `Freed    : ${s.bytesFreedHuman}\n` +
        `Interval : ${Math.round(s.intervalMs / 1000)}s\n` +
        `Last run : ${fmtTime(s.lastRun)}\n` +
        `Duration : ${s.lastDuration}ms\n` +
        `Reason   : ${s.lastReason || '-'}`
      );
    }

    // INTERVAL
    if (sub === 'interval' || sub === 'int') {
      const ms = parseDuration(ctx.args[1]);
      if (!ms) return ctx.reply('Usage: `.autoclean interval 60s` (s|m|h)');
      if (ms < 5000) return ctx.reply('❌ Minimal 5s');
      const ok = cleaner.setInterval(ms);
      if (!ok) return ctx.reply('❌ Gagal set interval');
      st?.set('autoCleanInterval', ms);
      return ctx.reply(`⏱️ Interval diset ke ${Math.round(ms / 1000)}s`);
    }

    // CLEAR persist
    if (sub === 'clear' || sub === 'reset') {
      st?.set('autoClean', null);
      return ctx.reply('🧹 State persist di-reset. Restart akan fallback ke `.env`.');
    }

    return ctx.reply(`❓ Sub tidak dikenal: *${sub}*\n\n${HELP}`);
  }
};

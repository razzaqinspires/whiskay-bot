import os from 'node:os';
import { getWorldBossTunnelStatus } from '../../services/worldBossTunnel.js';
import { getWebhookRuntimeStats } from '../../services/webhookRuntime.js';
import { outboundTrafficGuard } from '../../core/OutboundTrafficGuard.js';
import { workloadTracker } from '../../core/WorkloadTracker.js';
const mb = n => `${(n / 1024 / 1024).toFixed(1)} MB`;
const duration = sec => { const d=Math.floor(sec/86400), h=Math.floor(sec%86400/3600), m=Math.floor(sec%3600/60), s=Math.floor(sec%60); return [d&&`${d}h`,h&&`${h}j`,m&&`${m}m`,`${s}d`].filter(Boolean).join(' '); };
export default {
  name: 'ops-center', command: ['opsstatus','webhookstats','tunnelhealth','webhookdryrun','outboundstatus'], aliases: ['ops','opsdiag'], category: 'owner', owner: true, cooldown: 4000,
  description: 'Pusat observabilitas runtime, tunnel, dan webhook',
  async execute(ctx) {
    const cmd = String(ctx.command || '').toLowerCase();
    if (cmd === 'outboundstatus') {
      const queue = outboundTrafficGuard.stats();
      const policy = workloadTracker.outboundStats();
      return ctx.reply([
        '📨 *OUTBOUND DELIVERY WORKER*',
        `Status: ${queue.closed ? 'CLOSED' : queue.paused ? 'PAUSED' : 'ACTIVE'}`,
        `Queue depth: ${queue.queueDepth}/${queue.maxQueue || process.env.WHISKAY_OUTBOUND_QUEUE_MAX || 150}`,
        `Worker aktif: ${queue.active}/${queue.concurrency}`,
        `Pending start: ${queue.pendingStarts || 0}`,
        `Dikirim/accepted: ${policy.counters.accepted}`,
        `Masuk antrean: ${policy.counters.attempts}`,
        `Diblokir policy: ${policy.counters.blocked}`,
        `Duplikat ditahan: ${policy.counters.duplicatesBlocked}`,
        `Source quarantine: ${policy.counters.quarantineBlocked}`,
        `Gagal transport: ${policy.counters.failed}`,
        `Batas global: ${policy.policy.globalMaxPerMinute}/menit`,
        `Batas penerima: ${policy.policy.recipientMaxPerMinute}/menit`,
        `Interval minimum: ${policy.policy.minIntervalMs} ms`,
        `Queue wait maksimum: ${process.env.WHISKAY_OUTBOUND_QUEUE_WAIT_MAX_MS || 600000} ms`,
        `Risk terakhir: ${policy.lastRisk?.score ?? 0}/100 · ${policy.lastRisk?.state || 'NORMAL'}`,
        `Alasan terakhir: ${policy.lastRisk?.reason || '-'}`
      ].join('\\n'));
    }
    if (cmd === 'webhookdryrun') {
      const stats = getWebhookRuntimeStats(); const tunnel = getWorldBossTunnelStatus();
      return ctx.reply(['🧪 *WEBHOOK DRY RUN — TIDAK MENGIRIM PESAN*', `Tunnel: ${tunnel.mode}`, `URL tersedia: ${Boolean(tunnel.endpoint) ? 'ya' : 'tidak'}`, `Secret dikonfigurasi: ${Boolean(process.env.WHISKAY_BOSS_WEBHOOK_SECRET || process.env.DUNGEON_SYNC_TOKEN) ? 'ya' : 'tidak'}`, `Target mode: ${stats.targetMode}`, `Event diterima: ${stats.accepted}`, 'Simulasi selesai; tidak ada pesan WhatsApp yang dikirim.'].join('\n'));
    }
    if (cmd === 'webhookstats') {
      const s=getWebhookRuntimeStats();
      return ctx.reply(['📡 *WEBHOOK TELEMETRY*', `Uptime proses: ${duration(s.uptimeSeconds)}`, `Request: ${s.requests}`, `Event diterima: ${s.accepted}`, `Ditolak: ${s.rejected}`, `Duplikat: ${s.duplicates}`, `Terkirim: ${s.sent}`, `Gagal kirim: ${s.failed}`, `Mode target: ${s.targetMode}`, `Event terakhir: ${s.lastEventAt || '-'}`, `Hasil terakhir: ${s.lastResult || '-'}`].join('\n'));
    }
    const t=getWorldBossTunnelStatus();
    if (cmd === 'tunnelhealth') {
      let probe='belum diuji';
      try { if (t.url) { const r=await fetch(`${t.url}/healthz`, { signal: AbortSignal.timeout(4000), cache: 'no-store' }); probe=`HTTP ${r.status}`; } else probe='URL belum tersedia'; } catch(e) { probe=`gagal: ${e.name || 'network error'}`; }
      return ctx.reply(['🛰️ *TUNNEL HEALTH CHECK*', `Mode: ${t.mode}`, `Probe publik: ${probe}`, `Retry: ${t.retryCount}`, `Endpoint: ${t.endpoint || '-'}`, `Error terakhir: ${t.lastError || '-'}`].join('\n'));
    }
    const m=process.memoryUsage();
    return ctx.reply(['🧠 *WHISKAY OPS CENTER*', `Node: ${process.version} · ${os.platform()}/${os.arch()}`, `PID: ${process.pid}`, `Uptime: ${duration(process.uptime())}`, `RAM RSS: ${mb(m.rss)} · Heap: ${mb(m.heapUsed)}/${mb(m.heapTotal)}`, `CPU cores: ${os.cpus().length}`, `Load avg: ${os.loadavg().map(v=>v.toFixed(2)).join(' / ')}`, `Tunnel: ${t.mode}`, `Webhook URL: ${t.endpoint || '-'}`, `Retry: ${t.retryCount}`, `Last error: ${t.lastError || '-'}`].join('\n'));
  }
};

import os from 'node:os';
import { getWorldBossTunnelStatus } from '../../services/worldBossTunnel.js';
import { getWebhookRuntimeStats } from '../../services/webhookRuntime.js';
const mb = n => `${(n / 1024 / 1024).toFixed(1)} MB`;
const duration = sec => { const d=Math.floor(sec/86400), h=Math.floor(sec%86400/3600), m=Math.floor(sec%3600/60), s=Math.floor(sec%60); return [d&&`${d}h`,h&&`${h}j`,m&&`${m}m`,`${s}d`].filter(Boolean).join(' '); };
export default {
  name: 'ops-center', command: ['opsstatus','webhookstats','tunnelhealth','webhookdryrun'], aliases: ['ops','opsdiag'], category: 'owner', owner: true, cooldown: 4000,
  description: 'Pusat observabilitas runtime, tunnel, dan webhook',
  async execute(ctx) {
    const cmd = String(ctx.command || '').toLowerCase();
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

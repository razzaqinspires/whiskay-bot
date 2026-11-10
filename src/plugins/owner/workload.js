import { workloadTracker } from '../../core/WorkloadTracker.js';
import { workloadScheduler } from '../../core/WorkloadScheduler.js';
import { outboundTrafficGuard } from '../../core/OutboundTrafficGuard.js';

export default {
  name: 'workload-control',
  command: ['workload', 'workloadstatus'],
  category: 'owner',
  owner: true,
  energyMode: 'free',
  energyCost: 0,
  cooldown: 2000,
  description: 'Monitor worker, outbound traffic, telemetry dan ancaman spam',
  async execute(ctx) {
    await workloadTracker.load();
    const action = String(ctx.args?.[0] || 'status').toLowerCase();
    if (action === 'pause') {
      workloadScheduler.pause();
      return ctx.reply('⏸️ Worker scheduler dijeda. Job aktif diselesaikan; job antrean menunggu. Outbound safety queue tetap berjalan agar kontrol bot masih dapat merespons.');
    }
    if (action === 'resume') {
      workloadScheduler.resume();
      return ctx.reply('▶️ Worker scheduler dilanjutkan.');
    }
    if (action === 'clear-quarantine') {
      const cleared = await workloadTracker.clearSourceQuarantines();
      return ctx.reply(`Threat Agent: ${cleared} karantina sumber outbound dibersihkan secara manual. Policy rate-limit dan duplicate guard tetap aktif.`);
    }
    if (action === 'threat' || action === 'analyze') {
      const outboundNow = outboundTrafficGuard.stats();
      const report = await workloadTracker.analyzeThreat({ queueDepth: outboundNow.queueDepth, activeWorkers: outboundNow.active });
      const factors = report.factors?.length ? report.factors.map(item => `${item.key} (+${item.weight})`).join(' · ') : 'Tidak ada anomali kuat.';
      const quarantined = report.quarantineSources?.length ? report.quarantineSources.join(', ') : 'tidak ada';
      return ctx.reply(`THREAT INTELLIGENCE · ${report.state} ${report.score}/100\nFaktor: ${factors}\nQuarantine baru: ${quarantined}\nEngine: ${report.engine} · external model: ${report.externalModelUsed ? 'yes' : 'no'}\n${(report.recommendations || []).join('\n')}`);
    }
    if (action === 'help') return ctx.reply('Perintah: .workload status | threat | clear-quarantine | pause | resume');

    const scheduler = workloadScheduler.stats();
    const tracker = workloadTracker.stats();
    const runtime = tracker.current;
    const outbound = tracker.outbound;
    const outboundQueue = outboundTrafficGuard.stats();
    const threat = tracker.threat?.lastReport || outbound.lastRisk;
    const agent = await workloadTracker.sharedThreatStats();
    const quarantines = agent.quarantines || [];
    const workers = agent.workers || {};
    return ctx.sendInteractive({
      title: '🧠 Workload & Traffic Safety Monitor',
      subtitle: `Threat Agent ${threat.state} · skor ${threat.score}/100`,
      body: `RUNTIME
CPU ${runtime.cpuPercent}% · Heap ${runtime.heapPercent}% · Event loop ${runtime.eventLoopDelayMs} ms

BACKGROUND WORKERS
Status: ${scheduler.closed ? 'CLOSED' : scheduler.paused ? 'PAUSED' : 'RUNNING'}
Aktif: ${scheduler.active}/${scheduler.concurrency} · Antrean: ${scheduler.queueDepth}
Diterima ${scheduler.accepted} · Selesai ${scheduler.completed} · Gagal ${scheduler.failed} · Ditolak ${scheduler.rejected}

OUTBOUND WHATSAPP · 60 DETIK
Percobaan: ${outbound.recentAttempts}
Sumber: ${Object.entries(outbound.recentSources).map(([name, count]) => `${name}=${count}`).join(' · ') || '-'}
Queue: ${outboundQueue.active} aktif · ${outboundQueue.queueDepth} menunggu
Dikirim ${outbound.counters.accepted} · Diblokir ${outbound.counters.blocked} · Duplikat ${outbound.counters.duplicatesBlocked} · Gagal ${outbound.counters.failed}
Batas global: ${outbound.policy.globalMaxPerMinute}/menit · per penerima: ${outbound.policy.recipientMaxPerMinute}/menit
Alasan risiko terakhir: ${threat.reason || (threat.factors || []).map(item => item.key).join(', ') || 'normal'}

THREAT INTELLIGENCE AGENT
Monitoring: ${agent.monitoring ? 'ACTIVE' : agent.enabled ? 'READY' : 'DISABLED'} · auto-quarantine: ${agent.autoQuarantine ? 'ON' : 'OFF'}
Worker threads: ${workers.active || 0} aktif · ${workers.size || 0} tersedia · queue ${workers.queueDepth || 0}
Analisis: ${workers.completed || 0} selesai · ${workers.failed || 0} gagal · restart ${workers.workerRestarts || 0}
Karantina aktif: ${quarantines.length ? quarantines.map(row => `${row.source} (${Math.ceil(row.remainingMs / 1000)}s)`).join(' · ') : 'tidak ada'}
Faktor: ${(threat.factors || []).map(item => item.key).join(' · ') || 'tidak ada'}

TASK TRACKER
Mulai ${tracker.counters.tasksStarted} · selesai ${tracker.counters.tasksCompleted} · gagal ${tracker.counters.tasksFailed} · ditolak ${tracker.counters.tasksRejected}

Threat Agent berjalan lokal dalam worker_threads dan hanya menerima agregat/hash satu arah. Tidak ada isi pesan, nomor, argumen command, atau kredensial yang dikirim ke AI/provider eksternal. Quarantine hanya membatasi source pengiriman, bukan menambah target atau mengirim pesan.`,
      buttons: [
        { name: 'quick_reply', title: 'Refresh', id: `${ctx.prefix}workload status` },
        { name: 'quick_reply', title: 'Analisis Threat', id: `${ctx.prefix}workload threat` },
        { name: 'quick_reply', title: scheduler.paused ? '▶️ Resume' : '⏸️ Pause', id: `${ctx.prefix}workload ${scheduler.paused ? 'resume' : 'pause'}` },
      ],
    });
  },
};

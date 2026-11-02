import {workloadTracker} from '../../core/WorkloadTracker.js';
import {workloadScheduler} from '../../core/WorkloadScheduler.js';
export default {name:'workload-control',command:['workload','workloadstatus'],category:'owner',owner:true,energyMode:'free',energyCost:0,cooldown:2000,description:'Monitor antrean dan kontrol worker terikat batas',async execute(ctx){
 await workloadTracker.load();const action=String(ctx.args?.[0]||'status').toLowerCase();
 if(action==='pause'){workloadScheduler.pause();return ctx.reply('⏸️ Worker scheduler dijeda. Job aktif diselesaikan; job antrean menunggu.');}
 if(action==='resume'){workloadScheduler.resume();return ctx.reply('▶️ Worker scheduler dilanjutkan.');}
 if(action==='help')return ctx.reply('Perintah: .workload status | pause | resume');
 const s=workloadScheduler.stats(),t=workloadTracker.stats(),m=t.current;
 return ctx.sendInteractive({title:'🧠 Workload & Worker Monitor',subtitle:`${m.state} · skor tekanan ${m.score}/100`,body:`RUNTIME
CPU ${m.cpuPercent}% · Heap ${m.heapPercent}% · Event loop ${m.eventLoopDelayMs} ms

SCHEDULER
Status: ${s.closed?'CLOSED':s.paused?'PAUSED':'RUNNING'}
Aktif: ${s.active}/${s.concurrency} · Antrean: ${s.queueDepth}
Batas per lane: ${workloadScheduler.perLaneConcurrency}
Jeda minimum antar job: ${workloadScheduler.minIntervalMs} ms

HASIL JOB
Diterima ${s.accepted} · Selesai ${s.completed}
Gagal ${s.failed} · Ditolak ${s.rejected} · Dibatalkan ${s.cancelled}

TRACKER
Task mulai ${t.counters.tasksStarted} · selesai ${t.counters.tasksCompleted}
Gagal ${t.counters.tasksFailed} · ditolak ${t.counters.tasksRejected}

Catatan: antrean berisi fungsi aktif di memori dan tidak dipulihkan setelah restart. Batas ini untuk stabilitas dan kepatuhan rate-limit, bukan untuk menyamarkan aktivitas.`,buttons:[{name:'quick_reply',title:'Refresh',id:`${ctx.prefix}workload status`},{name:'quick_reply',title:s.paused?'▶️ Resume':'⏸️ Pause',id:`${ctx.prefix}workload ${s.paused?'resume':'pause'}`}]});
}};

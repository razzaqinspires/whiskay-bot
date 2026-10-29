import { claimDueReminders,finishReminder } from '../services/ReminderManager.js';
import { dueAdzan, markAdzanSent } from '../services/AdzanManager.js';
/** Runs only when explicitly started by Bot; claims persisted reminders before delivery. */
export async function runReminderDelivery(sock, now=Date.now()) {
  const result={claimed:0,sent:0,failed:0,adzan:0};
  const due=await claimDueReminders(now,25);result.claimed=due.length;
  for(const r of due){try{await sock.sendMessage(r.chat,{text:`⏰ *PENGINGAT*\n\n${r.text}\n\n_${new Date(now).toLocaleString('id-ID',{timeZone:r.timezone||'Asia/Jakarta'})}_`});await finishReminder(r.id,{ok:true,now});result.sent++;}catch(e){await finishReminder(r.id,{ok:false,error:e?.message,now}).catch(()=>{});result.failed++;}}
  const calls=await dueAdzan(now);for(const a of calls){try{await sock.sendMessage(a.chat,{text:`🕌 *WAKTU ADZAN ${a.name.toUpperCase()}*\nJadwal lokal yang dikonfigurasi: ${a.time}.\nPastikan waktu salat telah diverifikasi sesuai lokasi grup.`});await markAdzanSent(a.chat,a.name,a.day,true);result.adzan++;}catch{await markAdzanSent(a.chat,a.name,a.day,false).catch(()=>{});}}
  return result;
}
export default {name:'reminder-delivery',intervalMs:15000,enabled:true,run:({sock,now})=>runReminderDelivery(sock,now)};

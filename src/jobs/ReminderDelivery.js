import { claimDueReminders, finishReminder } from '../services/ReminderManager.js';
import { dueAdzan, markAdzanSent } from '../services/AdzanManager.js';
import { runPersonalAdzanScheduler } from '../services/AdzanEngineService.js';

/** Runs only when explicitly started by Bot. Personal adzan is opt-in and delivered by DM. */
export async function runReminderDelivery(sock, now = Date.now()) {
  const result = { claimed: 0, sent: 0, failed: 0, adzan: 0, personalAdzan: null };
  const due = await claimDueReminders(now, 25);
  result.claimed = due.length;
  for (const reminder of due) {
    try {
      await sock.sendMessage(reminder.chat, {
        text: `⏰ *PENGINGAT*\n\n${reminder.text}\n\n_${new Date(now).toLocaleString('id-ID', { timeZone: reminder.timezone || 'Asia/Jakarta' })}_`
      });
      await finishReminder(reminder.id, { ok: true, now });
      result.sent++;
    } catch (error) {
      await finishReminder(reminder.id, { ok: false, error: error?.message, now }).catch(() => {});
      result.failed++;
    }
  }
  const groupCalls = await dueAdzan(now);
  for (const item of groupCalls) {
    try {
      await sock.sendMessage(item.chat, { text: `🕌 *WAKTU ADZAN ${item.name.toUpperCase()}*\nJadwal manual grup: ${item.time}.` });
      await markAdzanSent(item.chat, item.name, item.day, true);
      result.adzan++;
    } catch {
      await markAdzanSent(item.chat, item.name, item.day, false).catch(() => {});
    }
  }
  result.personalAdzan = await runPersonalAdzanScheduler(sock, now);
  return result;
}
export default { name: 'reminder-delivery', intervalMs: 15000, enabled: true, run: ({ sock, now }) => runReminderDelivery(sock, now) };

import { getAllGroupSettings, updateGroupSettings } from './group-settings.js';

const minuteInJakarta = timestamp => new Date(timestamp).toLocaleTimeString('en-GB', {
  timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false
});
const dateInJakarta = timestamp => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date(timestamp));

/** Execute configured group open/close actions at most once per action per Jakarta date. */
export async function runGroupSchedules({ sock, now = Date.now(), onError = () => {} } = {}) {
  if (!sock || typeof sock.groupSettingUpdate !== 'function') return { checked: 0, executed: 0, failed: 0 };
  const rows = await getAllGroupSettings();
  const current = minuteInJakarta(now);
  const date = dateInJakarta(now);
  let executed = 0, failed = 0;
  for (const { groupId, settings } of rows) {
    const schedule = settings.schedule || {};
    const action = schedule.closeAt === current ? 'close' : schedule.openAt === current ? 'open' : null;
    if (!action || (action === 'close' ? schedule.lastCloseDate : schedule.lastOpenDate) === date) continue;
    try {
      await sock.groupSettingUpdate(groupId, action === 'close' ? 'announcement' : 'not_announcement');
      await updateGroupSettings(groupId, { schedule: { ...schedule, [action === 'close' ? 'lastCloseDate' : 'lastOpenDate']: date } });
      await sock.sendMessage?.(groupId, { text: action === 'close' ? '🔒 Grup ditutup otomatis sesuai jadwal (WIB).' : '🔓 Grup dibuka otomatis sesuai jadwal (WIB).' });
      executed++;
    } catch (error) {
      failed++;
      onError(error, { groupId, action });
    }
  }
  return { checked: rows.length, executed, failed, current, date };
}

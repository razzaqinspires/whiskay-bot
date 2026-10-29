const DEFAULT_ALLOWLIST = new Set(['offline', 'online', 'offlinestatus', 'menu', 'help', 'ping', 'start', 'owner', 'daftar', 'register', 'statusdaftar']);

export function normalizeOfflineStatus(value) {
  if (!value || typeof value !== 'object' || value.enabled !== true) return null;
  return {
    enabled: true,
    reason: String(value.reason || 'Tidak ada alasan yang diberikan').replace(/[\r\n\u0000-\u001f]/g, ' ').trim().slice(0, 240),
    since: Number.isFinite(Number(value.since)) ? Number(value.since) : Date.now(),
    changedBy: String(value.changedBy || '').slice(0, 120)
  };
}

export function shouldBlockForOffline({ status, isOwner = false, command = '', allowlist = DEFAULT_ALLOWLIST } = {}) {
  const current = normalizeOfflineStatus(status);
  if (!current || isOwner) return false;
  return !allowlist.has(String(command || '').toLowerCase());
}

export function formatOfflineStatus(status, { timeZone = 'Asia/Jakarta' } = {}) {
  const current = normalizeOfflineStatus(status);
  if (!current) return '🟢 Whiskay Bot dalam mode ONLINE.';
  const when = new Date(current.since).toLocaleString('id-ID', { timeZone, hour12: false });
  return `🔴 *WHISKAY BOT — MODE OFFLINE*\nAlasan: ${current.reason}\nSejak: ${when}\n\nPerintah pengguna sementara dinonaktifkan. Owner masih dapat mengelola bot.`;
}

export const offlineModeInternals = { DEFAULT_ALLOWLIST };

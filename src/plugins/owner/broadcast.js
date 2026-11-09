import { randomUUID } from 'node:crypto';
import { runWithOutboundContext } from '../../core/OutboundTrafficGuard.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const MAX_MESSAGE_CHARS = 3500;
const normalizeJid = value => String(value || '').trim();
const parseJidList = (value, kind) => String(value || '').split(',').map(normalizeJid).filter(jid => {
  if (kind === 'groups') return /^\d{5,25}-\d{5,25}@g\.us$/.test(jid);
  if (jid.includes('@')) return /^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/.test(jid);
  return /^\+?\d{8,15}$/.test(jid);
}).map(jid => kind === 'users' && !jid.includes('@') ? `${jid.replace(/\D/g, '')}@s.whatsapp.net` : jid);
const boundedInteger = (value, fallback, min, max) => {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
};

export function createBroadcastPlugin({
  now = () => Date.now(),
  sleepFn = sleep,
  getAllowedGroups = () => parseJidList(process.env.WHISKAY_BROADCAST_ALLOWED_GROUPS, 'groups'),
  getAllowedUsers = () => parseJidList(process.env.WHISKAY_BROADCAST_ALLOWED_USERS, 'users'),
  isEnabled = () => String(process.env.WHISKAY_BROADCAST_ENABLED || 'false').toLowerCase() === 'true',
} = {}) {
  let pendingCampaign = null;
  let activeCampaign = null;
  let lastCampaign = null;

  const help = prefix => [
    '📣 WHISKAY BROADCAST · CONTROLLED ANNOUNCEMENT',
    '',
    'Broadcast tidak lagi mengirim ke semua grup/pengguna secara otomatis.',
    'Target wajib masuk allowlist eksplisit, preview wajib dikonfirmasi, dan fitur tetap nonaktif sampai owner mengaktifkan WHISKAY_BROADCAST_ENABLED=true.',
    '',
    `${prefix}bc --groups pesan — siapkan preview grup yang diizinkan.`,
    `${prefix}bc --users pesan — siapkan preview pengguna yang diizinkan.`,
    `${prefix}bc confirm <token> — konfirmasi satu kampanye.`,
    `${prefix}bc status — status kampanye.`,
    `${prefix}bc cancel — hentikan kampanye aktif / batalkan preview.`,
    `${prefix}bc help — panduan.`,
    '',
    'Default: nonaktif · maksimal 5 target per kampanye · interval minimal 30 detik.',
    'Tidak ada pengiriman ke seluruh daftar grup atau registered-users secara implisit.',
  ].join('\n');

  async function preparePreview(ctx, prefix, mode, message) {
    if (!message) return ctx.reply('Teks pengumuman kosong.');
    if (message.length > MAX_MESSAGE_CHARS) return ctx.reply(`Teks terlalu panjang (maksimal ${MAX_MESSAGE_CHARS} karakter).`);
    if (activeCampaign?.status === 'RUNNING') return ctx.reply('Kampanye lain sedang berjalan. Gunakan .bc status atau .bc cancel.');

    let targets = mode === 'groups' ? getAllowedGroups() : getAllowedUsers();
    if (!Array.isArray(targets)) targets = [];
    targets = [...new Set(targets.map(normalizeJid))].filter(Boolean);
    if (mode === 'groups') {
      const sock = ctx.sock;
      if (!sock || typeof sock.groupFetchAllParticipating !== 'function') return ctx.reply('Koneksi WhatsApp tidak tersedia; preview dibatalkan.');
      let joined;
      try { joined = await sock.groupFetchAllParticipating(); }
      catch { return ctx.reply('Daftar grup tidak dapat diverifikasi. Preview dibatalkan tanpa mengirim pesan.'); }
      const participating = new Set(Object.keys(joined || {}));
      targets = targets.filter(jid => participating.has(jid));
    }
    if (!targets.length) {
      const key = mode === 'groups' ? 'WHISKAY_BROADCAST_ALLOWED_GROUPS' : 'WHISKAY_BROADCAST_ALLOWED_USERS';
      return ctx.reply(`Tidak ada target yang diizinkan. Isi ${key} dengan JID/nomor penerima yang benar-benar menyetujui pengumuman. Tidak ada pesan dikirim.`);
    }

    const maxTargets = boundedInteger(process.env.WHISKAY_BROADCAST_MAX_TARGETS, 5, 1, 5);
    if (targets.length > maxTargets) return ctx.reply(`Target ${targets.length} melebihi batas per kampanye (${maxTargets}). Pecah hanya untuk kelompok penerima yang memang menyetujui pengumuman.`);
    const token = randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
    pendingCampaign = {
      token,
      mode,
      targets,
      message,
      createdAt: now(),
      expiresAt: now() + 5 * 60_000,
      requestedBy: String(ctx.sender || ''),
      sourceChat: String(ctx.chat || ''),
      status: 'PREVIEW',
    };
    return ctx.sendInteractive({
      title: '📣 BROADCAST PREVIEW',
      subtitle: `Mode ${mode} · ${targets.length} target · belum ada pesan dikirim`,
      body: `Token konfirmasi: ${token}\nMasa berlaku: 5 menit\nPenerima: allowlist eksplisit\nBatas target per kampanye: ${maxTargets}\n\nIsi pesan: ${message.length} karakter\n\nPeriksa daftar target pada konfigurasi lokal sebelum konfirmasi. Tidak ada pesan yang dikirim pada tahap preview.`,
      buttons: [
        { name: 'quick_reply', title: 'Konfirmasi Kampanye', id: `${prefix}bc confirm ${token}` },
        { name: 'quick_reply', title: 'Batalkan', id: `${prefix}bc cancel` },
      ],
    });
  }

  async function executeCampaign(ctx, prefix, campaign) {
    const intervalMs = boundedInteger(process.env.WHISKAY_BROADCAST_INTERVAL_MS, 30000, 30000, 3_600_000);
    // Acknowledge first. If WhatsApp rejects the acknowledgement, do not leave a
    // campaign marked RUNNING and, importantly, do not start any target delivery.
    await ctx.reply(`Broadcast terkonfirmasi. ${campaign.targets.length} target allowlist diproses satu per satu; interval ${Math.round(intervalMs / 1000)} detik. Gunakan .bc status atau .bc cancel.`);
    const controller = new AbortController();
    activeCampaign = {
      ...campaign,
      status: 'RUNNING',
      startedAt: now(),
      sent: 0,
      failed: 0,
      currentIndex: 0,
      intervalMs,
      controller,
    };
    activeCampaign.promise = (async () => {
      const run = activeCampaign;
      try {
        for (let index = 0; index < campaign.targets.length; index++) {
          if (controller.signal.aborted) { run.status = 'CANCELLED'; break; }
          const jid = campaign.targets[index];
          run.currentIndex = index + 1;
          try {
            await runWithOutboundContext({ source: 'broadcast', command: 'broadcast', chat: campaign.sourceChat }, () =>
              ctx.sock.sendMessage(jid, {
                text: `📢 *PENGUMUMAN WHISKAYBOT*\n\n${campaign.message}\n\n_Informasi resmi dari pengelola bot._`,
              }),
            );
            run.sent++;
          } catch (error) {
            run.failed++;
            run.lastError = String(error?.message || error).slice(0, 240);
            // Any outbound admission block is a hard stop. In particular, a
            // Threat Agent quarantine must stop the campaign immediately
            // instead of repeatedly probing the remaining recipients.
            if (error?.code === 'WHISKAY_OUTBOUND_POLICY_BLOCKED') {
              run.status = 'BLOCKED_BY_OUTBOUND_POLICY';
              break;
            }
            if (error?.code === 'WHISKAY_OUTBOUND_SOURCE_QUARANTINED') {
              run.status = 'BLOCKED_BY_THREAT_QUARANTINE';
              break;
            }
          }
          if (index < campaign.targets.length - 1 && !controller.signal.aborted) {
            await sleepFn(intervalMs);
          }
        }
        if (run.status === 'RUNNING') run.status = controller.signal.aborted ? 'CANCELLED' : run.failed ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
      } catch (error) {
        run.status = 'ERROR';
        run.lastError = String(error?.message || error).slice(0, 240);
      } finally {
        run.finishedAt = now();
        lastCampaign = { ...run, controller: undefined, promise: undefined };
        if (activeCampaign === run) activeCampaign = null;
        await runWithOutboundContext({ source: 'broadcast-summary', command: 'broadcast', chat: campaign.sourceChat }, () =>
          ctx.reply(`Broadcast ${run.status}.\nBerhasil: ${run.sent}\nGagal: ${run.failed}\nTotal: ${campaign.targets.length}${run.lastError ? `\nAlasan terakhir: ${run.lastError}` : ''}`),
        ).catch(() => {});
      }
    })();
  }

  return {
    name: 'broadcast',
    command: ['bc', 'broadcast'],
    category: 'owner',
    owner: true,
    cooldown: 15000,
    description: 'Owner-only: allowlist, preview, konfirmasi, pembatasan target dan pengiriman berinterval',
    async execute(ctx) {
      if (!ctx.isOwner) return ctx.reply('🔒 Fitur broadcast hanya untuk owner bot.');
      const prefix = ctx.prefix || '.';
      const raw = String(ctx.args?.join(' ') || '').trim();
      if (!raw || ['help', '--help'].includes(raw.toLowerCase())) return ctx.reply(help(prefix));

      const [action = ''] = raw.split(/\s+/, 1);
      if (action.toLowerCase() === 'status') {
        const run = activeCampaign || lastCampaign || pendingCampaign;
        if (!run) return ctx.reply('Tidak ada preview atau kampanye broadcast tersimpan pada proses ini.');
        return ctx.reply([
          `Status: ${run.status}`,
          `Mode: ${run.mode}`,
          `Target: ${run.targets?.length || 0}`,
          `Progres: ${run.sent || 0} terkirim · ${run.failed || 0} gagal · indeks ${run.currentIndex || 0}`,
          run.token ? `Token: ${run.token}` : '',
          run.lastError ? `Error: ${run.lastError}` : '',
        ].filter(Boolean).join('\n'));
      }
      if (action.toLowerCase() === 'cancel') {
        if (pendingCampaign) pendingCampaign = null;
        if (activeCampaign?.controller) activeCampaign.controller.abort(new Error('Cancelled by owner'));
        return ctx.reply('Permintaan pembatalan dicatat. Pesan yang sudah terkirim tidak dapat ditarik; pengiriman berikutnya akan dihentikan.');
      }
      if (action.toLowerCase() === 'confirm') {
        const token = raw.split(/\s+/)[1] || '';
        if (!pendingCampaign || pendingCampaign.token !== token.toUpperCase()) return ctx.reply('Token preview tidak valid atau tidak tersedia. Buat preview baru dengan .bc --groups pesan / .bc --users pesan.');
        if (now() > pendingCampaign.expiresAt) { pendingCampaign = null; return ctx.reply('Preview kedaluwarsa. Buat preview baru sebelum mengirim.'); }
        if (!isEnabled()) return ctx.reply('Broadcast masih nonaktif secara default. Setelah seluruh penerima menyetujui pengumuman, owner harus mengaktifkan WHISKAY_BROADCAST_ENABLED=true pada konfigurasi server lalu memuat ulang proses. Tidak ada pesan yang dikirim.');
        const campaign = pendingCampaign;
        pendingCampaign = null;
        return executeCampaign(ctx, prefix, campaign);
      }

      const match = raw.match(/^(?:--preview\s+)?--(groups|users)\s+([\s\S]+)$/i);
      if (!match) return ctx.reply(help(prefix));
      const mode = match[1].toLowerCase();
      return preparePreview(ctx, prefix, mode, match[2].trim());
    },
  };
}

export default createBroadcastPlugin();

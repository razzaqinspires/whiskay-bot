import { getGroupSettings } from './group-settings.js';

const recentMessages = new Map();
const metadataCache = new Map();
const LINK_RE = /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|t\.me\/|discord\.gg\/)[^\s]+/i;
const now = () => Date.now();

async function groupMeta(sock, groupId) {
  const cached = metadataCache.get(groupId);
  if (cached && cached.sock === sock && cached.expiresAt > now()) return cached.value;
  const value = await sock.groupMetadata(groupId);
  metadataCache.set(groupId, { sock, value, expiresAt: now() + 5_000 });
  return value;
}

const isAdmin = p => p?.admin === 'admin' || p?.admin === 'superadmin';

export async function applyGroupGuard(ctx) {
  if (!ctx?.isGroup || ctx.fromMe || ctx.isBot || !ctx.sender || !ctx.chat) return false;
  const settings = await getGroupSettings(ctx.chat);
  if (!settings.antilink && !settings.antispam) return false;

  let metadata;
  try { metadata = await groupMeta(ctx.sock, ctx.chat); }
  catch { return false; }
  const participants = Array.isArray(metadata?.participants) ? metadata.participants : [];
  const sender = participants.find(p => p.id === ctx.sender || p.phoneNumber === ctx.sender);
  const botId = ctx.sock.user?.id;
  const bot = participants.find(p => p.id === botId || (p.id && botId && p.id.split('@')[0].split(':')[0] === botId.split('@')[0].split(':')[0]));
  if (isAdmin(sender) || ctx.isOwner) return false;
  {
    if (settings.antilink && LINK_RE.test(String(ctx.body || ''))) {
      if (isAdmin(bot)) {
        try { await ctx.sock.sendMessage(ctx.chat, { delete: ctx.raw?.key || ctx.key }); } catch {}
      }
      await ctx.reply(isAdmin(bot)
        ? '🚫 Tautan dihapus. Hanya admin yang boleh mengirim tautan di grup ini.'
        : '⚠️ Tautan terdeteksi, tetapi bot belum admin sehingga tidak dapat menghapus pesan.');
      return true;
    }
    if (settings.antispam) {
      const key = `${ctx.chat}:${ctx.sender}`;
      const cutoff = now() - 10_000;
      const entries = (recentMessages.get(key) || []).filter(t => t >= cutoff);
      entries.push(now());
      recentMessages.set(key, entries);
      if (entries.length > 6) {
        if (isAdmin(bot)) {
          try { await ctx.sock.sendMessage(ctx.chat, { delete: ctx.raw?.key || ctx.key }); } catch {}
        }
        await ctx.reply(isAdmin(bot)
          ? '🛑 Anti-spam: pesan terlalu sering. Tunggu beberapa detik sebelum mengirim lagi.'
          : '⚠️ Aktivitas pesan cepat terdeteksi; minta admin mengaktifkan hak admin untuk bot agar pesan dapat dimoderasi.');
        return true;
      }
    }
  }
  // Bound in-memory state to avoid growth in long-running processes.
  if (recentMessages.size > 5000) {
    for (const [key, times] of recentMessages) {
      if (!times.length || times[times.length - 1] < now() - 60_000) recentMessages.delete(key);
      if (recentMessages.size <= 4000) break;
    }
  }
  return false;
}

export async function sendGroupParticipantNotice(sock, update) {
  const groupId = String(update?.id || '');
  if (!groupId.endsWith('@g.us') || !Array.isArray(update?.participants)) return;
  let settings;
  try { settings = await getGroupSettings(groupId); } catch { return; }
  if (!settings.welcome) return;
  let metadata;
  try { metadata = await groupMeta(sock, groupId); } catch { metadata = { subject: 'grup ini' }; }
  const action = String(update.action || '').toLowerCase();
  if (!['add', 'remove'].includes(action)) return;
  for (const participant of update.participants.slice(0, 50)) {
    const jid = typeof participant === 'string' ? participant : participant?.id;
    if (!jid || !jid.includes('@')) continue;
    const name = `@${jid.split('@')[0].split(':')[0]}`;
    const template = action === 'add' ? settings.welcomeText : settings.leaveText;
    const text = String(template || '').replaceAll('{user}', name).replaceAll('{group}', String(metadata.subject || 'grup ini').slice(0, 100));
    try { await sock.sendMessage(groupId, { text: text.slice(0, 1000), mentions: [jid] }); } catch {}
  }
}
